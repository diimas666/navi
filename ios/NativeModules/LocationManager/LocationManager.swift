import CoreLocation
import Foundation

@objc public final class LocationManager: NSObject, CLLocationManagerDelegate {
  @objc public static let shared = LocationManager()

  private var manager: CLLocationManager!
  private let lock = NSLock()
  private var latestFix: NSDictionary?
  private var authWaiters: [(String) -> Void] = []
  private var alwaysWaiters: [(String) -> Void] = []
  private var alwaysEchoGuard = false

  @objc public var onFix: ((NSDictionary) -> Void)?
  @objc public var onAuthorization: ((String) -> Void)?
  var onInternalFix: ((NSDictionary) -> Void)?

  override private init() {
    super.init()
    if Thread.isMainThread {
      configureManager()
    } else {
      DispatchQueue.main.sync {
        self.configureManager()
      }
    }
  }

  private func configureManager() {
    let created = CLLocationManager()
    created.delegate = self
    created.desiredAccuracy = kCLLocationAccuracyBest
    created.activityType = .automotiveNavigation
    created.distanceFilter = kCLDistanceFilterNone
    created.headingFilter = 3
    created.pausesLocationUpdatesAutomatically = false
    manager = created
  }

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  @objc public func authorizationStatus() -> String {
    Self.mapStatus(manager.authorizationStatus)
  }

  @objc public func requestWhenInUse(_ completion: @escaping (String) -> Void) {
    onMain {
      let status = self.authorizationStatus()
      if status != "notDetermined" {
        completion(status)
        return
      }
      self.authWaiters.append(completion)
      self.manager.requestWhenInUseAuthorization()
    }
  }

  @objc public func requestAlways(_ completion: @escaping (String) -> Void) {
    onMain {
      let status = self.authorizationStatus()
      if status == "authorizedAlways" || status == "denied" || status == "restricted" {
        completion(status)
        return
      }
      self.alwaysWaiters.append(completion)
      self.alwaysEchoGuard = true
      self.manager.requestAlwaysAuthorization()
      self.alwaysEchoGuard = false
    }
  }

  @objc public func startUpdates(_ background: Bool) {
    onMain {
      if background {
        self.setBackgroundOnMain(true)
      }
      self.manager.startUpdatingLocation()
      self.manager.startUpdatingHeading()
    }
  }

  @objc public func stopUpdates() {
    onMain {
      self.setBackgroundOnMain(false)
      self.manager.stopUpdatingLocation()
      self.manager.stopUpdatingHeading()
    }
  }

  @objc public func setBackground(_ enabled: Bool) {
    onMain {
      self.setBackgroundOnMain(enabled)
    }
  }

  private func setBackgroundOnMain(_ enabled: Bool) {
    guard Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") != nil else {
      return
    }
    let allowed = enabled && authorizationStatus() == "authorizedAlways"
    manager.allowsBackgroundLocationUpdates = allowed
    manager.showsBackgroundLocationIndicator = allowed
    manager.pausesLocationUpdatesAutomatically = !allowed
    if allowed {
      manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
      manager.distanceFilter = kCLDistanceFilterNone
    } else {
      manager.desiredAccuracy = kCLLocationAccuracyBest
      manager.distanceFilter = kCLDistanceFilterNone
    }
  }

  @objc public func latest() -> NSDictionary? {
    lock.lock()
    let value = latestFix
    lock.unlock()
    return value
  }

  public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = Self.mapStatus(manager.authorizationStatus)
    onAuthorization?(status)
    // The delegate also fires while the dialog is still open, with notDetermined.
    // Completing the waiter then leaves the switch off after the user taps Allow.
    if status != "notDetermined", !authWaiters.isEmpty {
      let waiters = authWaiters
      authWaiters.removeAll()
      waiters.forEach { $0(status) }
    }
    guard !alwaysWaiters.isEmpty else { return }
    // requestAlwaysAuthorization repeats the current When In Use status before
    // the user chooses «Завжди дозволяти». That echo is not the answer.
    if alwaysEchoGuard && status == "authorizedWhenInUse" {
      return
    }
    if status == "authorizedAlways" || status == "denied" || status == "restricted" {
      let waiters = alwaysWaiters
      alwaysWaiters.removeAll()
      waiters.forEach { $0(status) }
    }
  }

  public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last else { return }
    let heading = manager.heading
    let trueHeading = heading?.trueHeading ?? -1
    let hasHeading = trueHeading >= 0
    let speed = location.speed
    let fix: NSDictionary = [
      "latitude": location.coordinate.latitude,
      "longitude": location.coordinate.longitude,
      "horizontalAccuracy": location.horizontalAccuracy,
      "altitude": location.altitude,
      "speed": speed >= 0 ? speed : 0,
      "heading": hasHeading ? trueHeading : 0,
      "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
      "hasSpeed": speed >= 0,
      "hasHeading": hasHeading,
    ]
    lock.lock()
    latestFix = fix
    lock.unlock()
    onFix?(fix)
    onInternalFix?(fix)
  }

  public func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    guard newHeading.trueHeading >= 0, var current = latest() as? [String: Any] else { return }
    current["heading"] = newHeading.trueHeading
    current["hasHeading"] = true
    let fix = current as NSDictionary
    lock.lock()
    latestFix = fix
    lock.unlock()
    onFix?(fix)
    onInternalFix?(fix)
  }

  public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // Тимчасова помилка CoreLocation. Застарілий фікс стане lost у LocationTrustEngine.
  }

  private static func mapStatus(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .notDetermined: return "notDetermined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorizedAlways: return "authorizedAlways"
    case .authorizedWhenInUse: return "authorizedWhenInUse"
    @unknown default: return "unknown"
    }
  }
}
