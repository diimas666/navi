import Foundation

/// Оцінює, чи можна вважати фікс GPS істиною.
/// Стани: trusted, degraded, untrusted, lost.
/// Це не фільтр Калмана: набір явних фізичних перевірок, які пізніше можна замінити на EKF.
@objc public final class LocationTrustEngine: NSObject {
  @objc public static let shared = LocationTrustEngine()

  private struct Sample {
    var latitude: Double
    var longitude: Double
    var accuracy: Double
    var speed: Double
    var hasSpeed: Bool
    var heading: Double
    var hasHeading: Bool
    var timestamp: Double
  }

  private let lock = NSLock()
  private var previous: Sample?
  private let earthRadius = 6_378_137.0

  @objc public func reset() {
    lock.lock()
    previous = nil
    lock.unlock()
  }

  @objc public func evaluate(_ fix: NSDictionary?) -> NSDictionary {
    guard let fix else {
      return result("lost", "no_fix")
    }

    let sample = Sample(
      latitude: NeivJSON.double(fix, "latitude"),
      longitude: NeivJSON.double(fix, "longitude"),
      accuracy: NeivJSON.double(fix, "horizontalAccuracy"),
      speed: NeivJSON.double(fix, "speed"),
      hasSpeed: NeivJSON.bool(fix, "hasSpeed"),
      heading: NeivJSON.double(fix, "heading"),
      hasHeading: NeivJSON.bool(fix, "hasHeading"),
      timestamp: NeivJSON.double(fix, "timestamp")
    )

    if sample.accuracy < 0 || !sample.latitude.isFinite || !sample.longitude.isFinite {
      return result("lost", "invalid_accuracy")
    }

    let age = Date().timeIntervalSince1970 * 1000 - sample.timestamp
    if age > 3_000 {
      return result("lost", "stale")
    }

    lock.lock()
    let prior = previous
    previous = sample
    lock.unlock()

    if sample.accuracy > 120 {
      return result("untrusted", "poor_accuracy")
    }

    if let prior {
      let dt = (sample.timestamp - prior.timestamp) / 1000
      if dt > 0, dt < 8 {
        let distance = haversine(prior.latitude, prior.longitude, sample.latitude, sample.longitude)
        let implied = distance / dt

        // iPhone speed in a car is often 5–10 km/h while the coordinates already moved at 80.
        // Position is the truth. A bogus speed must not freeze the marker.
        if implied > 85 {
          return result("untrusted", "impossible_speed")
        }
        if dt < 2, distance > 200, implied > 40 {
          return result("untrusted", "position_jump")
        }
      }
    }

    if sample.accuracy > 35 {
      return result("degraded", "degraded_accuracy")
    }
    return result("trusted", "ok")
  }

  private func result(_ trust: String, _ reason: String) -> NSDictionary {
    ["trust": trust, "reason": reason]
  }

  private func haversine(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
    let p1 = lat1 * .pi / 180
    let p2 = lat2 * .pi / 180
    let dLat = (lat2 - lat1) * .pi / 180
    let dLon = (lon2 - lon1) * .pi / 180
    let a = sin(dLat / 2) * sin(dLat / 2) + cos(p1) * cos(p2) * sin(dLon / 2) * sin(dLon / 2)
    return 2 * earthRadius * atan2(sqrt(a), sqrt(1 - a))
  }
}
