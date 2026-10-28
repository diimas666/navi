import CoreLocation
import CoreMotion
import Foundation

/// Кутова швидкість береться навколо вектора гравітації, тож працює і для вертикального тримача.
/// Абсолютний курс дає компас: верх телефону має дивитися вперед по ходу авто.
@objc public final class MotionManager: NSObject {
  @objc public static let shared = MotionManager()

  private let motion = CMMotionManager()
  private let activity = CMMotionActivityManager()
  /// iOS activity: the car is moving or standing. Without OBD it decides whether the speed holds.
  private var driving = false
  private var standing = false
  private let queue = OperationQueue()
  private let lock = NSLock()
  private var latestSample: NSDictionary?
  private var inertialSpeed = 0.0
  private var accelBias = 0.0
  private var stillFor = 0.0
  private var lastMotionAt = 0.0
  private var inertialReady = false
  var onInternalSample: ((NSDictionary) -> Void)?
  @objc public var onMotion: ((NSDictionary) -> Void)?

  override private init() {
    super.init()
    queue.maxConcurrentOperationCount = 1
    queue.qualityOfService = .userInteractive
  }

  @objc public func available() -> Bool {
    motion.isDeviceMotionAvailable
  }

  @objc public func start() -> Bool {
    guard motion.isDeviceMotionAvailable else { return false }
    startActivity()
    if motion.isDeviceMotionActive { return true }
    motion.deviceMotionUpdateInterval = 0.1
    let availableFrames = CMMotionManager.availableAttitudeReferenceFrames()
    if availableFrames.contains(.xArbitraryZVertical) {
      motion.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: queue) { [weak self] data, _ in
        guard let self, let data else { return }
        self.publish(data)
      }
    } else {
      motion.startDeviceMotionUpdates(to: queue) { [weak self] data, _ in
        guard let self, let data else { return }
        self.publish(data)
      }
    }
    return true
  }

  @objc public func stop() {
    motion.stopDeviceMotionUpdates()
    activity.stopActivityUpdates()
  }

  private func startActivity() {
    guard CMMotionActivityManager.isActivityAvailable() else { return }
    let status = CMMotionActivityManager.authorizationStatus()
    guard status != .denied, status != .restricted else { return }
    activity.startActivityUpdates(to: queue) { [weak self] sample in
      guard let self, let sample else { return }
      let sure = sample.confidence != .low
      self.lock.lock()
      self.driving = sure && sample.automotive && !sample.stationary
      self.standing = sure && sample.stationary
      self.lock.unlock()
    }
  }

  @objc public func latest() -> NSDictionary? {
    lock.lock()
    let value = latestSample
    lock.unlock()
    return value
  }

  /// Підлаштовує інерційну швидкість під OBD або надійний GPS, щоб після їх зникнення машина не стрибала.
  @objc public func adoptSpeed(_ speed: Double) {
    lock.lock()
    inertialSpeed = min(55, max(0, speed))
    inertialReady = true
    stillFor = 0
    lock.unlock()
  }

  @objc public func inertialSpeedMps() -> Double {
    lock.lock()
    let value = inertialSpeed
    lock.unlock()
    return value
  }

  private func publish(_ data: CMDeviceMotion) {
    let gravity = data.gravity
    let rate = data.rotationRate
    let yaw = rate.x * gravity.x + rate.y * gravity.y + rate.z * gravity.z
    let heading = LocationManager.shared.latest()
    let hasHeading = NeivJSON.bool(heading ?? [:], "hasHeading")
    let headingValue = NeivJSON.double(heading ?? [:], "heading")
    let accuracy = hasHeading ? 12.0 : -1.0
    let user = data.userAcceleration
    let acceleration = sqrt(user.x * user.x + user.y * user.y + user.z * user.z)
    let now = Date().timeIntervalSince1970 * 1000
    lock.lock()
    integrateSpeed(data, yaw: yaw, now: now)
    let ready = inertialReady
    let speed = inertialSpeed
    lock.unlock()
    let sample: NSDictionary = [
      "hasHeading": hasHeading,
      "heading": headingValue,
      "headingAccuracy": accuracy,
      "hasYawRate": true,
      "yawRate": yaw,
      "acceleration": acceleration,
      "hasInertialSpeed": ready,
      "inertialSpeed": speed,
      "timestamp": now,
    ]
    lock.lock()
    latestSample = sample
    lock.unlock()
    onMotion?(sample)
    onInternalSample?(sample)
  }

  /// Верх телефону дивиться вперед. Швидкість — інтеграл прискорення вздовж цієї осі.
  /// Нуль швидкості не ставиться від тиші на прямій: гальмування саме зменшує її.
  private func integrateSpeed(_ data: CMDeviceMotion, yaw: Double, now: Double) {
    let rawDt = lastMotionAt > 0 ? (now - lastMotionAt) / 1000 : 0
    lastMotionAt = now
    let dt = min(max(rawDt, 0), 0.5)
    guard dt > 0 else { return }

    let gravity = data.gravity
    let glen = sqrt(gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z)
    let gx = glen > 0.2 ? gravity.x / glen : 0
    let gy = glen > 0.2 ? gravity.y / glen : 0
    let gz = glen > 0.2 ? gravity.z / glen : -1
    var fx = 0 - gx * gy
    var fy = 1 - gy * gy
    var fz = 0 - gz * gy
    let flen = sqrt(fx * fx + fy * fy + fz * fz)
    if flen < 0.25 {
      fx = 0
      fy = 0
      fz = -1
    } else {
      fx /= flen
      fy /= flen
      fz /= flen
    }
    let user = data.userAcceleration
    let forward = (user.x * fx + user.y * fy + user.z * fz) * 9.80665
    accelBias += (forward - accelBias) * min(1, dt / 15.0)
    let corrected = forward - accelBias
    let quiet = abs(user.x) + abs(user.y) + abs(user.z) < 0.05 && abs(yaw) < 0.05
    if quiet {
      stillFor += dt
    } else {
      stillFor = 0
    }
    if abs(corrected) > 0.12 {
      inertialSpeed = min(55, max(0, inertialSpeed + corrected * dt))
    }
    if standing {
      inertialSpeed *= exp(-dt / 1.0)
    } else if stillFor > 8.0 && inertialSpeed < 2.0 {
      inertialSpeed *= exp(-dt / 1.5)
    } else {
      // Steady cruising holds speed; natural slow coasting drag
      inertialSpeed *= exp(-dt / 60.0)
    }
    inertialReady = true
  }
}
