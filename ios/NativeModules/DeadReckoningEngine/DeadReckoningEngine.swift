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
  /// Drift counts from the last GPS fix or network fix that bounded the estimate.
  private var driftDistance = 0.0
  private var driftTime = 0.0
  /// Last trusted GPS fix. A network fix the car could not reach from here is ignored.
  private var anchorLat = 0.0
  private var anchorLon = 0.0
  private var anchorTimestamp = 0.0
  private var lastNetworkTimestamp = 0.0
  private var networkPulls = 0
  private let maxCarSpeed = 45.0
  private let maxNetworkAccuracy = 3_000.0
  private let earthRadius = 6_378_137.0

  @objc public func hasValidPosition() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return hasPosition && latitude.isFinite && longitude.isFinite && (abs(latitude) > 0.01 || abs(longitude) > 0.01)
  }

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
    driftDistance = 0
    driftTime = 0
    anchorTimestamp = 0
    lastNetworkTimestamp = 0
    networkPulls = 0
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
    let hasNetwork = NeivJSON.bool(input, "hasNetworkFix")
    let networkLat = NeivJSON.double(input, "networkLatitude")
    let networkLon = NeivJSON.double(input, "networkLongitude")
    let networkAccuracy = NeivJSON.double(input, "networkAccuracy")
    let networkTimestamp = NeivJSON.double(input, "networkTimestamp")

    let rawDt = lastTimestamp > 0 ? (timestamp - lastTimestamp) / 1000 : 0
    let dt = min(max(rawDt, 0), 1)
    let paused = rawDt > 2.5
    if rawDt > 1 {
      timeSinceGPS += rawDt - dt
      driftTime += rawDt - dt
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

    let network = hasNetwork
      ? acceptNetworkFix(lat: networkLat, lon: networkLon, accuracy: networkAccuracy, timestamp: networkTimestamp)
      : nil
    if !hasPosition, let network {
      // Jammed since launch: a Wi-Fi or cell fix is better than no point at all.
      latitude = network.lat
      longitude = network.lon
      accuracy = network.accuracy
      outageBase = network.accuracy
      driftDistance = 0
      driftTime = 0
      confidence = max(0.05, min(0.9, 30 / max(accuracy, 1)))
      hasPosition = true
      networkPulls += 1
      source = allow ? "dr" : "held"
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
    driftTime += dt
    if let network {
      pullToward(network)
    }
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
      driftDistance += stepDistance
    }
    let headingSlack = max(0, fused.accuracy) / 180 * driftDistance * 0.5
    accuracy = outageBase + driftDistance * 0.03 + driftTime * 0.8 + headingSlack
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
      driftDistance = 0
      driftTime = 0
      outageBase = max(gpsAccuracy, 5)
      setAnchor(lat, lon)
      return
    }

    let gap = haversine(latitude, longitude, lat, lon)
    // While following GPS a 70 m step is one fix at speed. Coming back from DR it is a visible jump.
    let following = source == "gps"
    if paused || gap <= 15 || (following && gap <= 70) {
      latitude = lat
      longitude = lon
      source = "gps"
    } else {
      // After a long outage DR can be hundreds of metres off while the car keeps moving.
      // A fixed 40 m/s chase then lags for many seconds, so the pull grows with the gap.
      let catchup = 40.0
      let step = min(max(dt, 0.05), 1)
      let budget = max(catchup * step, gap * min(1, step / 1.5))
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
      driftDistance = 0
      driftTime = 0
      outageBase = max(gpsAccuracy, 5)
    }
    setAnchor(lat, lon)
    confidence = min(1, 28 / max(accuracy, 1))
    hasPosition = true
  }

  private func setAnchor(_ lat: Double, _ lon: Double) {
    anchorLat = lat
    anchorLon = lon
    anchorTimestamp = lastTimestamp
  }

  /// Under jamming iOS still places the phone by Wi-Fi and cell towers, ±100…3000 m.
  /// Too coarse to drive by, but it stops the estimate from staying in the yard
  /// when there is no OBD speed. A fix the car could not have reached is spoofing.
  private func acceptNetworkFix(
    lat: Double,
    lon: Double,
    accuracy fixAccuracy: Double,
    timestamp: Double
  ) -> (lat: Double, lon: Double, accuracy: Double)? {
    guard timestamp > lastNetworkTimestamp else { return nil }
    lastNetworkTimestamp = timestamp
    guard lat.isFinite, lon.isFinite, abs(lat) > 0.01 || abs(lon) > 0.01 else { return nil }
    guard fixAccuracy > 0, fixAccuracy <= maxNetworkAccuracy else { return nil }
    if anchorTimestamp > 0 {
      let elapsed = max(0, (lastTimestamp - anchorTimestamp) / 1000)
      let reach = 300 + fixAccuracy + maxCarSpeed * elapsed
      if haversine(anchorLat, anchorLon, lat, lon) > reach {
        return nil
      }
    }
    return (lat, lon, fixAccuracy)
  }

  /// The car is inside the network circle. An estimate outside it moves to its inner half;
  /// one inside it stays and only its uncertainty shrinks.
  private func pullToward(_ network: (lat: Double, lon: Double, accuracy: Double)) {
    let gap = haversine(latitude, longitude, network.lat, network.lon)
    let keep = network.accuracy * 0.5
    if gap > network.accuracy {
      moveToward(network.lat, network.lon, gap - keep)
      networkPulls += 1
    }
    let left = haversine(latitude, longitude, network.lat, network.lon)
    let bounded = left + network.accuracy
    if bounded < accuracy {
      accuracy = bounded
      outageBase = bounded
      driftDistance = 0
      driftTime = 0
    }
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
      "networkPulls": networkPulls,
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
