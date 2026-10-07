import Foundation

/// Детермінована оцінка положення.
/// Дистанція = швидкість × час, нова точка — на сфері.
/// Повернення GPS зводить маркер плавно, без стрибка.
/// `HeadingFusion` і крок інтегрування замінюються на EKF без зміни контракту `step`.
@objc public final class DeadReckoningEngine: NSObject {
  @objc public static let shared = DeadReckoningEngine()

  private let lock = NSLock()
  private var hasPosition = false
  private var latitude = 0.0
  private var longitude = 0.0
  private var heading = 0.0
  private var accuracy = 0.0
  private var confidence = 0.0
  private var distanceSinceGPS = 0.0
  private var timeSinceGPS = 0.0
  private var lastTimestamp = 0.0
  private var source = "none"
  private var outageBase = 8.0
  private let earthRadius = 6_378_137.0

  @objc public func reset() {
    lock.lock()
    hasPosition = false
    latitude = 0
    longitude = 0
    heading = 0
    accuracy = 0
    confidence = 0
    distanceSinceGPS = 0
    timeSinceGPS = 0
    lastTimestamp = 0
    source = "none"
    outageBase = 8
    lock.unlock()
  }

  @objc public func step(_ input: NSDictionary) -> NSDictionary {
    lock.lock()
    defer { lock.unlock() }

    let timestamp = NeivJSON.double(input, "timestamp")
    let trust = NeivJSON.string(input, "trust")
    let allow = NeivJSON.bool(input, "allowIntegration")
    let hasGps = NeivJSON.bool(input, "hasGps")
    let gpsLat = NeivJSON.double(input, "latitude")
    let gpsLon = NeivJSON.double(input, "longitude")
    let gpsAccuracy = max(0, NeivJSON.double(input, "accuracy"))
    let hasGpsSpeed = NeivJSON.bool(input, "hasGpsSpeed")
    let gpsSpeed = NeivJSON.double(input, "gpsSpeed")
    let hasGpsHeading = NeivJSON.bool(input, "hasGpsHeading")
    let gpsHeading = NeivJSON.double(input, "gpsHeading")
    let hasVehicleSpeed = NeivJSON.bool(input, "hasVehicleSpeed")
    let vehicleSpeed = max(0, NeivJSON.double(input, "vehicleSpeedMps"))
    let hasHeading = NeivJSON.bool(input, "hasHeading")
    let motionHeading = NeivJSON.double(input, "heading")
    let motionAccuracy = NeivJSON.double(input, "headingAccuracy")
    let hasYaw = NeivJSON.bool(input, "hasYawRate")
    let yawRate = NeivJSON.double(input, "yawRate")

    let rawDt = lastTimestamp > 0 ? (timestamp - lastTimestamp) / 1000 : 0
    let dt = min(max(rawDt, 0), 1)
    let paused = rawDt > 2.5
    if rawDt > 1 {
      timeSinceGPS += rawDt - dt
    }
    lastTimestamp = timestamp

    let followGps = (trust == "trusted" || trust == "degraded") && hasGps
    if followGps {
      applyTrustedFix(
        lat: gpsLat,
        lon: gpsLon,
        accuracy: gpsAccuracy,
        hasSpeed: hasGpsSpeed,
        speed: gpsSpeed,
        hasCourse: hasGpsHeading,
        course: gpsHeading,
        hasMotionHeading: hasHeading,
        motionHeading: motionHeading,
        dt: dt,
        paused: paused
      )
      return snapshot()
    }

    if !hasPosition {
      let seedable = hasGps && gpsLat.isFinite && gpsLon.isFinite && (abs(gpsLat) > 0.01 || abs(gpsLon) > 0.01)
      if !seedable {
        source = "none"
        return snapshot()
      }
      latitude = gpsLat
      longitude = gpsLon
      if hasGpsHeading {
        heading = normalize(gpsHeading)
      } else if hasHeading {
        heading = normalize(motionHeading)
      }
      accuracy = max(gpsAccuracy, 8)
      confidence = 0.4
      hasPosition = true
      outageBase = max(gpsAccuracy, 8)
      source = allow ? "dr" : "held"
      if !allow {
        return snapshot()
      }
    }

    timeSinceGPS += dt
    if !allow {
      source = "held"
      confidence = max(0.05, min(confidence, 0.4))
      return snapshot()
    }

    let fused = HeadingFusion.fuse(
      previous: heading,
      hasAbsolute: hasHeading,
      absolute: motionHeading,
      accuracy: motionAccuracy,
      hasYaw: hasYaw,
      yawRate: yawRate,
      dt: dt
    )
    heading = fused.heading
    let stepDistance = hasVehicleSpeed ? vehicleSpeed * dt : 0
    if stepDistance > 0 {
      let next = project(latitude, longitude, stepDistance, heading)
      latitude = next.0
      longitude = next.1
      distanceSinceGPS += stepDistance
    }
    let headingSlack = max(0, fused.accuracy) / 180 * distanceSinceGPS * 0.5
    accuracy = outageBase + distanceSinceGPS * 0.03 + timeSinceGPS * 0.8 + headingSlack
    confidence = max(0.05, min(0.9, 30 / max(accuracy, 1)))
    source = "dr"
    return snapshot()
  }

  private func applyTrustedFix(
    lat: Double,
    lon: Double,
    accuracy gpsAccuracy: Double,
    hasSpeed: Bool,
    speed: Double,
    hasCourse: Bool,
    course: Double,
    hasMotionHeading: Bool,
    motionHeading: Double,
    dt: Double,
    paused: Bool
  ) {
    if !hasPosition {
      latitude = lat
      longitude = lon
      if hasCourse && hasSpeed && speed > 1.5 {
        heading = normalize(course)
      } else if hasMotionHeading {
        heading = normalize(motionHeading)
      }
      accuracy = max(gpsAccuracy, 3)
      confidence = min(1, 28 / max(accuracy, 1))
      hasPosition = true
      source = "gps"
      timeSinceGPS = 0
      distanceSinceGPS = 0
      outageBase = max(gpsAccuracy, 5)
      return
    }

    let gap = haversine(latitude, longitude, lat, lon)
    let implied = dt > 0.05 ? gap / dt : gap / 0.05
    let carLike = gap <= 50 && implied <= 28
    if paused || carLike {
      latitude = lat
      longitude = lon
      source = "gps"
    } else {
      let catchup = min(40, max(16, implied))
      let budget = catchup * min(max(dt, 0.05), 1)
      moveToward(lat, lon, budget)
      let left = haversine(latitude, longitude, lat, lon)
      if left < 4 {
        latitude = lat
        longitude = lon
        source = "gps"
      } else {
        source = "blended"
      }
    }
    let blendDt = dt > 0 ? dt : 0.2
    if hasCourse && hasSpeed && speed > 1.5 {
      heading = blendAngle(heading, course, min(1, blendDt / 0.8))
    } else if hasMotionHeading {
      heading = blendAngle(heading, motionHeading, min(1, blendDt / 0.8))
    }
    accuracy = approach(accuracy, max(gpsAccuracy, 3), blendDt)
    if source == "gps" {
      timeSinceGPS = 0
      distanceSinceGPS = 0
      outageBase = max(gpsAccuracy, 5)
    }
    confidence = min(1, 28 / max(accuracy, 1))
    hasPosition = true
  }

  private func moveToward(_ lat: Double, _ lon: Double, _ maxMeters: Double) {
    let gap = haversine(latitude, longitude, lat, lon)
    if gap <= max(0, maxMeters) || gap < 0.4 {
      latitude = lat
      longitude = lon
      return
    }
    let next = project(latitude, longitude, maxMeters, bearing(latitude, longitude, lat, lon))
    latitude = next.0
    longitude = next.1
  }

  private func bearing(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
    let p1 = lat1 * .pi / 180
    let p2 = lat2 * .pi / 180
    let dLon = (lon2 - lon1) * .pi / 180
    let y = sin(dLon) * cos(p2)
    let x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dLon)
    let degrees = atan2(y, x) * 180 / .pi
    return degrees < 0 ? degrees + 360 : degrees
  }

  private func snapshot() -> NSDictionary {
    NeivJSON.payload([
      "valid": hasPosition,
      "latitude": latitude,
      "longitude": longitude,
      "heading": normalize(heading),
      "accuracy": accuracy,
      "confidence": confidence,
      "distanceSinceGPS": distanceSinceGPS,
      "timeSinceGPS": timeSinceGPS,
      "source": source,
    ])
  }

  private func project(_ lat: Double, _ lon: Double, _ distance: Double, _ headingDegrees: Double) -> (Double, Double) {
    let delta = distance / earthRadius
    let theta = headingDegrees * .pi / 180
    let lat1 = lat * .pi / 180
    let lon1 = lon * .pi / 180
    let lat2 = asin(sin(lat1) * cos(delta) + cos(lat1) * sin(delta) * cos(theta))
    let lon2 = lon1 + atan2(sin(theta) * sin(delta) * cos(lat1), cos(delta) - sin(lat1) * sin(lat2))
    return (lat2 * 180 / .pi, lon2 * 180 / .pi)
  }

  private func haversine(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
    let p1 = lat1 * .pi / 180
    let p2 = lat2 * .pi / 180
    let dLat = (lat2 - lat1) * .pi / 180
    let dLon = (lon2 - lon1) * .pi / 180
    let a = sin(dLat / 2) * sin(dLat / 2) + cos(p1) * cos(p2) * sin(dLon / 2) * sin(dLon / 2)
    return 2 * earthRadius * atan2(sqrt(a), sqrt(1 - a))
  }

  private func approach(_ current: Double, _ target: Double, _ dt: Double) -> Double {
    let gain = 1 - exp(-dt / 1.3)
    return current + (target - current) * gain
  }

  private func blendAngle(_ from: Double, _ to: Double, _ gain: Double) -> Double {
    let delta = atan2(sin((to - from) * .pi / 180), cos((to - from) * .pi / 180)) * 180 / .pi
    return normalize(from + delta * gain)
  }

  private func normalize(_ degrees: Double) -> Double {
    let value = degrees.truncatingRemainder(dividingBy: 360)
    return value < 0 ? value + 360 : value
  }
}

enum HeadingFusion {
  static func fuse(
    previous: Double,
    hasAbsolute: Bool,
    absolute: Double,
    accuracy: Double,
    hasYaw: Bool,
    yawRate: Double,
    dt: Double
  ) -> (heading: Double, accuracy: Double) {
    if hasAbsolute && accuracy >= 0 && accuracy < 55 {
      let delta = atan2(sin((absolute - previous) * .pi / 180), cos((absolute - previous) * .pi / 180))
      let next = previous + delta * 180 / .pi * min(1, max(dt, 0.05) / 0.5)
      let wrapped = next.truncatingRemainder(dividingBy: 360)
      return (wrapped < 0 ? wrapped + 360 : wrapped, accuracy)
    }
    if hasYaw {
      let next = previous + yawRate * dt * 180 / .pi
      let wrapped = next.truncatingRemainder(dividingBy: 360)
      return (wrapped < 0 ? wrapped + 360 : wrapped, min(180, 30 + abs(yawRate) * 8))
    }
    return (previous, 50)
  }
}
