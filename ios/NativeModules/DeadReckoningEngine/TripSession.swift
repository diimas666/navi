import Foundation
import Network
import AVFoundation
import UIKit

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
  private var backgroundTask = UIBackgroundTaskIdentifier.invalid
  private var lastFixTimestamp = 0.0
  private var lastFixLat = 0.0
  private var lastFixLon = 0.0

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

  @objc public func clipboardText(_ completion: @escaping (String) -> Void) {
    DispatchQueue.main.async {
      completion(UIPasteboard.general.string ?? "")
    }
  }

  @objc public func beginBackgroundWork() {
    DispatchQueue.main.async {
      self.endBackgroundWork()
      self.backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "neiv-download") {
        self.endBackgroundWork()
      }
    }
  }

  @objc public func endBackgroundWork() {
    DispatchQueue.main.async {
      if self.backgroundTask != .invalid {
        UIApplication.shared.endBackgroundTask(self.backgroundTask)
        self.backgroundTask = .invalid
      }
    }
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
      setIdleTimer(false)
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
    setIdleTimer(true)
    wire()
    if !DeadReckoningEngine.shared.hasValidPosition() {
      DeadReckoningEngine.shared.reset()
      LocationTrustEngine.shared.reset()
    }
    LocationManager.shared.startUpdates(true)
    _ = MotionManager.shared.start()
    publish(step: false)
    completion(true)
  }

  private func haversineDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
    let earthRadius = 6_378_137.0
    let p1 = lat1 * .pi / 180
    let p2 = lat2 * .pi / 180
    let dLat = (lat2 - lat1) * .pi / 180
    let dLon = (lon2 - lon1) * .pi / 180
    let a = sin(dLat / 2) * sin(dLat / 2) + cos(p1) * cos(p2) * sin(dLon / 2) * sin(dLon / 2)
    return 2 * earthRadius * atan2(sqrt(a), sqrt(1 - a))
  }

  @objc public func stopNavigation() {
    navigationActive = false
    setIdleTimer(false)
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
    let rawGpsSpeed = NeivJSON.double(fix ?? [:], "speed")
    let hasGpsSpeed = fix != nil && NeivJSON.bool(fix ?? [:], "hasSpeed") && rawGpsSpeed >= 0
    let gpsSpeed = max(0, rawGpsSpeed)

    var fallbackGpsSpeed: Double? = nil
    if let fix = fix {
      let fixTime = NeivJSON.double(fix, "timestamp")
      let fixLat = NeivJSON.double(fix, "latitude")
      let fixLon = NeivJSON.double(fix, "longitude")
      if lastFixTimestamp > 0 && fixTime > lastFixTimestamp && (fixTime - lastFixTimestamp) <= 6000 {
        let dtGps = (fixTime - lastFixTimestamp) / 1000.0
        let dist = haversineDistance(lat1: lastFixLat, lon1: lastFixLon, lat2: fixLat, lon2: fixLon)
        let calcSpeed = dist / dtGps
        if calcSpeed >= 0.5 && calcSpeed <= 85 {
          fallbackGpsSpeed = calcSpeed
        }
      }
      if fixTime > lastFixTimestamp {
        lastFixTimestamp = fixTime
        lastFixLat = fixLat
        lastFixLon = fixLon
      }
    }

    let effectiveGpsSpeed = (hasGpsSpeed && gpsSpeed > 0) ? gpsSpeed : (fallbackGpsSpeed ?? 0)
    let hasEffectiveGpsSpeed = (hasGpsSpeed && gpsSpeed > 0) || fallbackGpsSpeed != nil

    let inertial = MotionManager.shared.inertialSpeedMps()
    let jammed = trust == "lost" || trust == "untrusted"
    let followGps = !ignoreGps && fix != nil && !jammed
    let sensorSpeed = hasVehicle ? vehicle : inertial
    let hasSensorSpeed = hasVehicle || inertial > 0.3
    if hasVehicle {
      MotionManager.shared.adoptSpeed(vehicle)
    } else if followGps && (trust == "trusted" || trust == "degraded") && hasEffectiveGpsSpeed {
      MotionManager.shared.adoptSpeed(effectiveGpsSpeed)
    }
    let integrate = jammed && drAllowed && (navigationActive || preview)
    // Wi-Fi and cell fixes are too coarse to follow, but they keep the estimate in the right area.
    let networkFix = !ignoreGps && reason == "poor_accuracy" ? fix : nil
    let input: NSDictionary = [
      "timestamp": Date().timeIntervalSince1970 * 1000,
      "trust": trust,
      "allowIntegration": integrate,
      "hasGps": followGps,
      "latitude": NeivJSON.double(fix ?? [:], "latitude"),
      "longitude": NeivJSON.double(fix ?? [:], "longitude"),
      "accuracy": NeivJSON.double(fix ?? [:], "horizontalAccuracy"),
      "hasGpsSpeed": hasEffectiveGpsSpeed,
      "gpsSpeed": effectiveGpsSpeed,
      "hasGpsHeading": followGps && NeivJSON.bool(fix ?? [:], "hasHeading"),
      "gpsHeading": NeivJSON.double(fix ?? [:], "heading"),
      "hasVehicleSpeed": hasSensorSpeed,
      "vehicleSpeedMps": sensorSpeed,
      "hasHeading": NeivJSON.bool(motion ?? [:], "hasHeading"),
      "heading": NeivJSON.double(motion ?? [:], "heading"),
      "headingAccuracy": NeivJSON.double(motion ?? [:], "headingAccuracy"),
      "hasYawRate": NeivJSON.bool(motion ?? [:], "hasYawRate"),
      "yawRate": NeivJSON.double(motion ?? [:], "yawRate"),
      "hasNetworkFix": networkFix != nil,
      "networkLatitude": NeivJSON.double(networkFix ?? [:], "latitude"),
      "networkLongitude": NeivJSON.double(networkFix ?? [:], "longitude"),
      "networkAccuracy": NeivJSON.double(networkFix ?? [:], "horizontalAccuracy"),
      "networkTimestamp": NeivJSON.double(networkFix ?? [:], "timestamp"),
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
    } else if followGps && (trust == "trusted" || trust == "degraded") && hasEffectiveGpsSpeed {
      speedSource = "gps"
      speed = effectiveGpsSpeed
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
    linkSatisfied = up
    linkLock.unlock()
  }

  private func setIdleTimer(_ on: Bool) {
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = on
    }
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
      "networkPulls": NeivJSON.double(output, "networkPulls"),
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
