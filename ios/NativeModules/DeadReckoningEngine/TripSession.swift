import Foundation
import Network
import AVFoundation

/// Зводить GPS, довіру, OBD і рух в одну оцінку.
@objc public final class TripSession: NSObject {
  @objc public static let shared = TripSession()

  private var navigationActive = false
  private var drAllowed = false
  private var ignoreGps = false
  private var preview = false
  private let linkLock = NSLock()
  private var linkSatisfied = true
  private var linkMonitor: NWPathMonitor?
  @objc public var onSnapshot: ((NSDictionary) -> Void)?
  @objc public var onSessionError: ((NSDictionary) -> Void)?
  private let speaker = AVSpeechSynthesizer()

  @objc public func speak(_ phrase: String, language: String) {
    let utterance = AVSpeechUtterance(string: phrase)
    utterance.voice = AVSpeechSynthesisVoice(language: language == "ru" ? "ru-RU" : "uk-UA")
    utterance.rate = 0.48
    speaker.stopSpeaking(at: .immediate)
    speaker.speak(utterance)
  }

  @objc public func stopSpeaking() {
    speaker.stopSpeaking(at: .immediate)
  }

  @objc public func startPreview() {
    preview = true
    watchLink()
    wire()
    LocationManager.shared.startUpdates(false)
    _ = MotionManager.shared.start()
  }

  @objc public func stopPreview() {
    preview = false
    if !navigationActive {
      LocationManager.shared.stopUpdates()
      MotionManager.shared.stop()
    }
  }

  @objc public func startNavigation(_ completion: @escaping (Bool) -> Void) {
    let status = LocationManager.shared.authorizationStatus()
    guard status == "authorizedAlways" || status == "authorizedWhenInUse" else {
      onSessionError?([
        "code": "PERMISSION_ERROR",
        "message": "Немає дозволу на геопозицію",
      ])
      completion(false)
      return
    }
    navigationActive = true
    preview = true
    wire()
    DeadReckoningEngine.shared.reset()
    LocationTrustEngine.shared.reset()
    LocationManager.shared.startUpdates(true)
    _ = MotionManager.shared.start()
    publish(step: false)
    completion(true)
  }

  @objc public func stopNavigation() {
    navigationActive = false
    LocationManager.shared.setBackground(false)
    publish(step: false)
  }

  @objc public func setDeadReckoningAllowed(_ allowed: Bool) {
    drAllowed = allowed
  }

  /// Перевірка без GPS: фікс лишається в системі, але оцінювач його не приймає.
  @objc public func setIgnoreGps(_ enabled: Bool) {
    ignoreGps = enabled
    publish(step: true)
  }

  @objc public func resetEstimator() {
    DeadReckoningEngine.shared.reset()
    LocationTrustEngine.shared.reset()
  }

  private func wire() {
    LocationManager.shared.onInternalFix = { [weak self] _ in
      self?.liveTick()
    }
    MotionManager.shared.onInternalSample = { [weak self] _ in
      self?.liveTick()
    }
  }

  private func liveTick() {
    publish(step: true)
  }

  private func publish(step: Bool) {
    let fix = LocationManager.shared.latest()
    let trustInfo = LocationTrustEngine.shared.evaluate(fix)
    let trust = ignoreGps ? "lost" : (trustInfo["trust"] as? String ?? "lost")
    let reason = ignoreGps ? "gps_check" : (trustInfo["reason"] as? String ?? "no_fix")
    let motion = MotionManager.shared.latest()
    let obd = OBDManager.shared.latest()
    let hasVehicle = NeivJSON.bool(obd, "hasSpeed")
    let vehicle = NeivJSON.double(obd, "speedKmh") / 3.6
    let hasGpsSpeed = fix != nil && NeivJSON.bool(fix ?? [:], "hasSpeed")
    let gpsSpeed = NeivJSON.double(fix ?? [:], "speed")
    let inertial = MotionManager.shared.inertialSpeedMps()
    let jammed = trust == "lost" || trust == "untrusted"
    let sensorDrive = navigationActive && !isLinkUp()
    let followGps = !sensorDrive && !ignoreGps && fix != nil && !jammed
    let sensorSpeed = hasVehicle ? vehicle : inertial
    let hasSensorSpeed = hasVehicle || inertial > 0.3
    if hasVehicle {
      MotionManager.shared.adoptSpeed(vehicle)
    } else if followGps && trust == "trusted" && hasGpsSpeed {
      MotionManager.shared.adoptSpeed(gpsSpeed)
    }
    let integrate = (sensorDrive || jammed) && drAllowed && (navigationActive || preview)
    let input: NSDictionary = [
      "timestamp": Date().timeIntervalSince1970 * 1000,
      "trust": trust,
      "allowIntegration": integrate,
      "hasGps": followGps,
      "latitude": NeivJSON.double(fix ?? [:], "latitude"),
      "longitude": NeivJSON.double(fix ?? [:], "longitude"),
      "accuracy": NeivJSON.double(fix ?? [:], "horizontalAccuracy"),
      "hasGpsSpeed": hasGpsSpeed,
      "gpsSpeed": gpsSpeed,
      "hasGpsHeading": followGps && NeivJSON.bool(fix ?? [:], "hasHeading"),
      "gpsHeading": NeivJSON.double(fix ?? [:], "heading"),
      "hasVehicleSpeed": hasSensorSpeed,
      "vehicleSpeedMps": sensorSpeed,
      "hasHeading": !sensorDrive && !jammed && NeivJSON.bool(motion ?? [:], "hasHeading"),
      "heading": NeivJSON.double(motion ?? [:], "heading"),
      "headingAccuracy": NeivJSON.double(motion ?? [:], "headingAccuracy"),
      "hasYawRate": NeivJSON.bool(motion ?? [:], "hasYawRate"),
      "yawRate": NeivJSON.double(motion ?? [:], "yawRate"),
    ]
    let output = step || navigationActive || preview
      ? DeadReckoningEngine.shared.step(input)
      : DeadReckoningEngine.shared.step(input)
    let speedSource: String
    let speed: Double
    let hasSpeed: Bool
    if hasVehicle {
      speedSource = "obd"
      speed = vehicle
      hasSpeed = true
    } else if followGps && trust == "trusted" && hasGpsSpeed {
      speedSource = "gps"
      speed = gpsSpeed
      hasSpeed = true
    } else if hasSensorSpeed {
      speedSource = "inertial"
      speed = inertial
      hasSpeed = true
    } else {
      speedSource = "none"
      speed = 0
      hasSpeed = false
    }
    emit(
      output: output,
      trust: trust,
      reason: reason,
      followGps: followGps,
      fix: fix,
      speedMps: speed,
      hasSpeed: hasSpeed,
      speedSource: speedSource,
      motionQuality: motionQuality(motion),
      obdQuality: hasVehicle ? "good" : (OBDManager.shared.connectionState() == "ready" ? "weak" : "none")
    )
  }

  private func watchLink() {
    if linkMonitor != nil {
      return
    }
    let monitor = NWPathMonitor()
    monitor.pathUpdateHandler = { [weak self] path in
      self?.setLink(path.status == .satisfied)
    }
    let queue = DispatchQueue(label: "navi.link")
    monitor.start(queue: queue)
    linkMonitor = monitor
  }

  private func setLink(_ up: Bool) {
    linkLock.lock()
    let changed = linkSatisfied != up
    linkSatisfied = up
    linkLock.unlock()
    if changed {
      publish(step: true)
    }
  }

  private func isLinkUp() -> Bool {
    linkLock.lock()
    let value = linkSatisfied
    linkLock.unlock()
    return value
  }

  private func motionQuality(_ motion: NSDictionary?) -> String {
    guard let motion else { return "none" }
    let age = Date().timeIntervalSince1970 * 1000 - NeivJSON.double(motion, "timestamp")
    if age > 2_000 { return "none" }
    if NeivJSON.bool(motion, "hasHeading") && NeivJSON.double(motion, "headingAccuracy") < 30 {
      return "good"
    }
    return "weak"
  }

  private func emit(
    output: NSDictionary,
    trust: String,
    reason: String,
    followGps: Bool,
    fix: NSDictionary?,
    speedMps: Double,
    hasSpeed: Bool,
    speedSource: String,
    motionQuality: String,
    obdQuality: String
  ) {
    let snapshot: NSDictionary = [
      "navigationActive": navigationActive,
      "drAllowed": drAllowed,
      "trust": trust,
      "trustReason": reason,
      "hasGps": followGps,
      "gpsLatitude": NeivJSON.double(fix ?? [:], "latitude"),
      "gpsLongitude": NeivJSON.double(fix ?? [:], "longitude"),
      "gpsAccuracy": NeivJSON.double(fix ?? [:], "horizontalAccuracy") == 0
        ? NeivJSON.double(fix ?? [:], "accuracy")
        : NeivJSON.double(fix ?? [:], "horizontalAccuracy"),
      "gpsSpeed": NeivJSON.double(fix ?? [:], "speed"),
      "gpsHeading": NeivJSON.double(fix ?? [:], "heading"),
      "hasEstimate": NeivJSON.bool(output, "valid"),
      "latitude": NeivJSON.double(output, "latitude"),
      "longitude": NeivJSON.double(output, "longitude"),
      "heading": NeivJSON.double(output, "heading"),
      "accuracy": NeivJSON.double(output, "accuracy"),
      "confidence": NeivJSON.double(output, "confidence"),
      "distanceSinceGPS": NeivJSON.double(output, "distanceSinceGPS"),
      "timeSinceGPS": NeivJSON.double(output, "timeSinceGPS"),
      "source": NeivJSON.string(output, "source"),
      "hasSpeed": hasSpeed,
      "speedMps": speedMps,
      "speedSource": speedSource,
      "motionQuality": motionQuality,
      "obdQuality": obdQuality,
      "timestamp": Date().timeIntervalSince1970 * 1000,
    ]
    DispatchQueue.main.async { [weak self] in
      self?.onSnapshot?(snapshot)
    }
  }
}
