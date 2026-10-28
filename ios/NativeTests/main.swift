import Foundation

// Сценарії РЕБ для LocationTrustEngine і DeadReckoningEngine.
// Збирається на macOS без симулятора: `yarn test:native`.

var failures = 0
var passed = 0

func check(_ condition: Bool, _ message: String) {
  if condition {
    passed += 1
  } else {
    failures += 1
    print("  ✕ \(message)")
  }
}

func scenario(_ name: String, _ body: () -> Void) {
  print("• \(name)")
  LocationTrustEngine.shared.reset()
  DeadReckoningEngine.shared.reset()
  body()
}

let earth = 6_378_137.0
let startMs = Date().timeIntervalSince1970 * 1000

/// Moves a point by meters east and north.
func offset(_ lat: Double, _ lon: Double, east: Double, north: Double) -> (Double, Double) {
  let dLat = north / earth * 180 / .pi
  let dLon = east / (earth * cos(lat * .pi / 180)) * 180 / .pi
  return (lat + dLat, lon + dLon)
}

func distance(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
  let p1 = lat1 * .pi / 180
  let p2 = lat2 * .pi / 180
  let dLat = (lat2 - lat1) * .pi / 180
  let dLon = (lon2 - lon1) * .pi / 180
  let a = sin(dLat / 2) * sin(dLat / 2) + cos(p1) * cos(p2) * sin(dLon / 2) * sin(dLon / 2)
  return 2 * earth * atan2(sqrt(a), sqrt(1 - a))
}

func fix(_ lat: Double, _ lon: Double, at seconds: Double, accuracy: Double = 6, speed: Double = 15, heading: Double = 90) -> NSDictionary {
  [
    "latitude": lat,
    "longitude": lon,
    "horizontalAccuracy": accuracy,
    "speed": speed,
    "hasSpeed": true,
    "heading": heading,
    "hasHeading": true,
    "timestamp": startMs + seconds * 1000,
  ]
}

func trust(_ fix: NSDictionary) -> String {
  LocationTrustEngine.shared.evaluate(fix)["trust"] as? String ?? "?"
}

func reason(_ fix: NSDictionary) -> String {
  LocationTrustEngine.shared.evaluate(fix)["reason"] as? String ?? "?"
}

// Odesa, driving east at 15 m/s.
let home = (46.4825, 30.7233)

scenario("звичайна їзда — кожен фікс довірений") {
  for second in 0..<60 {
    let point = offset(home.0, home.1, east: Double(second) * 15, north: 0)
    check(trust(fix(point.0, point.1, at: Double(second))) == "trusted", "фікс \(second) мав бути trusted")
  }
}

scenario("спуфінг: стрибок на 50 км і далі рівний підмінений трек") {
  for second in 0..<20 {
    let point = offset(home.0, home.1, east: Double(second) * 15, north: 0)
    _ = trust(fix(point.0, point.1, at: Double(second)))
  }
  let fake = offset(home.0, home.1, east: 0, north: 50_000)
  var trustedFakes = 0
  for step in 0..<120 {
    let point = offset(fake.0, fake.1, east: Double(step) * 15, north: 0)
    // Spoofers report perfect accuracy.
    if trust(fix(point.0, point.1, at: Double(20 + step), accuracy: 3)) != "untrusted" {
      trustedFakes += 1
    }
  }
  check(trustedFakes == 0, "підмінений трек не можна приймати, прийнято \(trustedFakes) з 120")
}

scenario("той самий фікс на тиках датчиків зберігає вердикт") {
  _ = trust(fix(home.0, home.1, at: 0))
  let jump = offset(home.0, home.1, east: 0, north: 900)
  let first = fix(jump.0, jump.1, at: 1)
  let verdicts = (0..<30).map { _ in trust(first) }
  check(verdicts.allSatisfy { $0 == "untrusted" }, "стрибок на 900 м за 1 с має лишатись untrusted: \(Set(verdicts))")
}

scenario("справжній GPS повертається після 60 с спуфінгу") {
  for second in 0..<10 {
    let point = offset(home.0, home.1, east: Double(second) * 15, north: 0)
    _ = trust(fix(point.0, point.1, at: Double(second)))
  }
  let fake = offset(home.0, home.1, east: 0, north: 80_000)
  for step in 0..<60 {
    let point = offset(fake.0, fake.1, east: Double(step) * 15, north: 0)
    _ = trust(fix(point.0, point.1, at: Double(10 + step), accuracy: 3))
  }
  var verdicts: [String] = []
  for step in 0..<5 {
    let point = offset(home.0, home.1, east: Double(70 + step) * 15, north: 0)
    verdicts.append(trust(fix(point.0, point.1, at: Double(70 + step))))
  }
  check(verdicts.dropFirst().allSatisfy { $0 == "trusted" }, "після повернення GPS довіра має відновитись: \(verdicts)")
}

scenario("довге глушіння 30 хв, GPS з'являється за 25 км") {
  _ = trust(fix(home.0, home.1, at: 0))
  let far = offset(home.0, home.1, east: 25_000, north: 0)
  let first = trust(fix(far.0, far.1, at: 1800))
  let next = offset(far.0, far.1, east: 15, north: 0)
  let second = trust(fix(next.0, next.1, at: 1801))
  check(first == "trusted" && second == "trusted", "реальне переміщення за 30 хв приймається: \(first), \(second)")
}

scenario("погана точність при глушінні") {
  _ = trust(fix(home.0, home.1, at: 0))
  let point = offset(home.0, home.1, east: 15, north: 0)
  check(trust(fix(point.0, point.1, at: 1, accuracy: 300)) == "untrusted", "точність 300 м — untrusted")
  let next = offset(home.0, home.1, east: 30, north: 0)
  check(trust(fix(next.0, next.1, at: 2, accuracy: 80)) == "degraded", "точність 80 м — degraded")
}

scenario("застарілий фікс не повертає старий вердикт") {
  let old: NSDictionary = [
    "latitude": home.0, "longitude": home.1, "horizontalAccuracy": 5.0,
    "speed": 0.0, "hasSpeed": false, "heading": 0.0, "hasHeading": false,
    "timestamp": Date().timeIntervalSince1970 * 1000 - 20_000,
  ]
  check(trust(old) == "lost" && reason(old) == "stale", "фікс 20 с тому — lost/stale")
}

// Dead reckoning.

func drStep(at seconds: Double, trust: String, gps: (Double, Double)?, accuracy: Double = 6,
            vehicleSpeed: Double?, heading: Double = 90, allow: Bool = true) -> NSDictionary {
  [
    "timestamp": startMs + seconds * 1000,
    "trust": trust,
    "allowIntegration": allow && (trust == "lost" || trust == "untrusted"),
    "hasGps": gps != nil && (trust == "trusted" || trust == "degraded"),
    "latitude": gps?.0 ?? 0,
    "longitude": gps?.1 ?? 0,
    "accuracy": accuracy,
    "hasGpsSpeed": gps != nil,
    "gpsSpeed": vehicleSpeed ?? 0,
    "hasGpsHeading": gps != nil,
    "gpsHeading": heading,
    "hasVehicleSpeed": vehicleSpeed != nil,
    "vehicleSpeedMps": vehicleSpeed ?? 0,
    "hasHeading": false,
    "heading": 0,
    "headingAccuracy": -1,
    "hasYawRate": true,
    "yawRate": 0,
  ]
}

func coords(_ out: NSDictionary) -> (Double, Double) {
  (NeivJSON.double(out, "latitude"), NeivJSON.double(out, "longitude"))
}

scenario("DR: глушіння 30 с з OBD 20 м/с — точка їде далі") {
  var t = 0.0
  for second in 0..<10 {
    let point = offset(home.0, home.1, east: Double(second) * 20, north: 0)
    _ = DeadReckoningEngine.shared.step(drStep(at: t, trust: "trusted", gps: point, vehicleSpeed: 20))
    t = Double(second) + 1
  }
  let lastGps = offset(home.0, home.1, east: 180, north: 0)
  var out: NSDictionary = [:]
  for tick in 1...300 {
    out = DeadReckoningEngine.shared.step(drStep(at: 9 + Double(tick) * 0.1, trust: "lost", gps: nil, vehicleSpeed: 20))
  }
  let place = coords(out)
  let travelled = distance(lastGps.0, lastGps.1, place.0, place.1)
  check(abs(travelled - 600) < 40, "за 30 с при 20 м/с має проїхати ~600 м, проїхав \(Int(travelled))")
  let truth = offset(home.0, home.1, east: 780, north: 0)
  let error = distance(truth.0, truth.1, place.0, place.1)
  check(error < 50, "похибка DR на прямій < 50 м, вийшло \(Int(error))")
  let accuracy = NeivJSON.double(out, "accuracy")
  check(accuracy > 20 && accuracy >= error, "невизначеність росте і покриває похибку: ±\(Int(accuracy)) при \(Int(error))")
  check(NeivJSON.string(out, "source") == "dr", "джерело — dr")
}

scenario("DR: повернення GPS без телепорту") {
  _ = DeadReckoningEngine.shared.step(drStep(at: 0, trust: "trusted", gps: home, vehicleSpeed: 0))
  for tick in 1...100 {
    _ = DeadReckoningEngine.shared.step(drStep(at: Double(tick) * 0.1, trust: "lost", gps: nil, vehicleSpeed: 20))
  }
  let real = offset(home.0, home.1, east: 200 + 150, north: 120)
  var previous = coords(DeadReckoningEngine.shared.step(drStep(at: 10.1, trust: "lost", gps: nil, vehicleSpeed: 20)))
  var biggestHop = 0.0
  var out: NSDictionary = [:]
  for tick in 1...60 {
    out = DeadReckoningEngine.shared.step(drStep(at: 10.1 + Double(tick) * 0.1, trust: "trusted", gps: real, vehicleSpeed: 0))
    let now = coords(out)
    biggestHop = max(biggestHop, distance(previous.0, previous.1, now.0, now.1))
    previous = now
  }
  check(biggestHop < 30, "за тік 0.1 с маркер не стрибає більше 30 м, стрибнув \(Int(biggestHop))")
  check(distance(previous.0, previous.1, real.0, real.1) < 5, "за 6 с маркер зводиться до GPS, лишилось \(Int(distance(previous.0, previous.1, real.0, real.1))) м, source \(NeivJSON.string(out, "source"))")
  check(NeivJSON.string(out, "source") == "gps", "джерело знову gps")
}

scenario("DR: без OBD і без інерціальної швидкості точка стоїть") {
  _ = DeadReckoningEngine.shared.step(drStep(at: 0, trust: "trusted", gps: home, vehicleSpeed: 15))
  var out: NSDictionary = [:]
  for tick in 1...100 {
    out = DeadReckoningEngine.shared.step(drStep(at: Double(tick) * 0.1, trust: "lost", gps: nil, vehicleSpeed: nil))
  }
  let place = coords(out)
  check(distance(home.0, home.1, place.0, place.1) < 1, "без джерела швидкості DR не рухає точку")
}

func networkStep(_ base: NSDictionary, _ point: (Double, Double), accuracy: Double, at seconds: Double) -> NSDictionary {
  let input = NSMutableDictionary(dictionary: base)
  input["hasNetworkFix"] = true
  input["networkLatitude"] = point.0
  input["networkLongitude"] = point.1
  input["networkAccuracy"] = accuracy
  input["networkTimestamp"] = startMs + seconds * 1000
  return input
}

scenario("DR без OBD: вежі й Wi-Fi не дають точці лишитись у дворі") {
  _ = DeadReckoningEngine.shared.step(drStep(at: 0, trust: "trusted", gps: home, vehicleSpeed: 3))
  // Five minutes of jamming without a speed source. The car is 4 km east.
  for tick in 1...3000 {
    _ = DeadReckoningEngine.shared.step(drStep(at: Double(tick) * 0.1, trust: "untrusted", gps: nil, vehicleSpeed: nil))
  }
  let car = offset(home.0, home.1, east: 4_000, north: 0)
  let tower = offset(car.0, car.1, east: 250, north: -150)
  let out = DeadReckoningEngine.shared.step(
    networkStep(drStep(at: 300.1, trust: "untrusted", gps: nil, vehicleSpeed: nil), tower, accuracy: 600, at: 300)
  )
  let place = coords(out)
  let error = distance(car.0, car.1, place.0, place.1)
  check(error < 700, "оцінка підтягнулась до машини: похибка \(Int(error)) м")
  check(NeivJSON.double(out, "accuracy") >= error, "невизначеність покриває похибку: ±\(Int(NeivJSON.double(out, "accuracy"))) при \(Int(error))")
  check(NeivJSON.double(out, "networkPulls") == 1, "лічильник підтягувань виріс")
  let again = DeadReckoningEngine.shared.step(
    networkStep(drStep(at: 300.2, trust: "untrusted", gps: nil, vehicleSpeed: nil), tower, accuracy: 600, at: 300)
  )
  check(NeivJSON.double(again, "networkPulls") == 1, "той самий фікс не тягне вдруге")
}

scenario("DR: фікс веж, недосяжний від останнього GPS, — підміна") {
  _ = DeadReckoningEngine.shared.step(drStep(at: 0, trust: "trusted", gps: home, vehicleSpeed: 15))
  let far = offset(home.0, home.1, east: 0, north: 200_000)
  let out = DeadReckoningEngine.shared.step(
    networkStep(drStep(at: 60, trust: "untrusted", gps: nil, vehicleSpeed: nil), far, accuracy: 800, at: 60)
  )
  let place = coords(out)
  check(distance(home.0, home.1, place.0, place.1) < 1_000, "точка не стрибає на 200 км")
}

scenario("DR: глушіння від запуску — перша точка з веж") {
  let tower = offset(home.0, home.1, east: 100, north: 100)
  let out = DeadReckoningEngine.shared.step(
    networkStep(drStep(at: 0, trust: "untrusted", gps: nil, vehicleSpeed: nil), tower, accuracy: 900, at: 0)
  )
  check(NeivJSON.bool(out, "valid"), "оцінка з'явилась")
  check(NeivJSON.double(out, "accuracy") >= 900, "з чесною похибкою ±\(Int(NeivJSON.double(out, "accuracy")))")
}

scenario("DR: поворот на 90 градусів під час глушіння") {
  _ = DeadReckoningEngine.shared.step(drStep(at: 0, trust: "trusted", gps: home, vehicleSpeed: 10, heading: 90))
  // Car drives east at 10 m/s for 5 seconds under jamming
  for tick in 1...50 {
    _ = DeadReckoningEngine.shared.step(drStep(at: Double(tick) * 0.1, trust: "lost", gps: nil, vehicleSpeed: 10, heading: 90))
  }
  // Turn right toward south (yaw rate = +90 deg/s for 1 second = pi/2 rad/s)
  var turnedOut: NSDictionary = [:]
  for tick in 1...10 {
    let stepInput = NSMutableDictionary(dictionary: drStep(at: 5.0 + Double(tick) * 0.1, trust: "lost", gps: nil, vehicleSpeed: 10, heading: 180))
    stepInput["hasYawRate"] = true
    stepInput["yawRate"] = Double.pi / 2.0
    turnedOut = DeadReckoningEngine.shared.step(stepInput)
  }
  let finalHeading = NeivJSON.double(turnedOut, "heading")
  check(abs(finalHeading - 180) < 15, "курс повернув на південь (180°): \(finalHeading)°")
}

print("\n\(passed) passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
