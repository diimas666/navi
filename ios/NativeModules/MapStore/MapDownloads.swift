import Foundation

/// Large map files: a background URLSession keeps going while the app is folded or locked.
/// A broken download keeps its resume data, so the next attempt continues instead of starting over.
@objc public final class MapDownloads: NSObject, URLSessionDownloadDelegate {
  @objc public static let shared = MapDownloads()
  @objc public static let sessionIdentifier = "com.neiv.app.maps"

  private struct Waiter {
    let resolve: (Double) -> Void
    let reject: (String) -> Void
  }

  private let lock = NSLock()
  private var waiters: [String: Waiter] = [:]
  private var progress: [String: Double] = [:]
  private var tasks: [String: URLSessionDownloadTask] = [:]
  private var finishEvents: (() -> Void)?

  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.background(withIdentifier: MapDownloads.sessionIdentifier)
    configuration.isDiscretionary = false
    configuration.sessionSendsLaunchEvents = true
    configuration.allowsCellularAccess = true
    configuration.timeoutIntervalForRequest = 60
    return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
  }()

  /// AppDelegate hands over the system completion handler for events that arrived while the app slept.
  @objc public func attachBackgroundEvents(_ handler: @escaping () -> Void) {
    lock.lock()
    finishEvents = handler
    lock.unlock()
    _ = session
  }

  @objc public func start(
    _ url: String,
    name: String,
    resolve: @escaping (Double) -> Void,
    reject: @escaping (String) -> Void
  ) {
    guard let remote = URL(string: url), remote.scheme == "https", MapStore.shared.fileURL(name) != nil else {
      reject("bad download")
      return
    }
    lock.lock()
    if let previous = waiters[name] {
      previous.reject("replaced")
    }
    waiters[name] = Waiter(resolve: resolve, reject: reject)
    let running = tasks[name]
    lock.unlock()
    if running != nil {
      return
    }
    session.getAllTasks { [weak self] existing in
      guard let self else { return }
      if let task = existing.first(where: { $0.taskDescription == name && $0.state == .running }) as? URLSessionDownloadTask {
        self.track(task, name)
        return
      }
      let task: URLSessionDownloadTask
      if let resume = self.resumeData(name) {
        task = self.session.downloadTask(withResumeData: resume)
      } else {
        task = self.session.downloadTask(with: remote)
      }
      task.taskDescription = name
      self.track(task, name)
      task.resume()
    }
  }

  @objc public func fraction(_ name: String) -> Double {
    lock.lock()
    defer { lock.unlock() }
    return progress[name] ?? -1
  }

  @objc public func cancel(_ name: String) {
    lock.lock()
    let task = tasks[name]
    lock.unlock()
    task?.cancel { [weak self] data in
      if let data { self?.saveResumeData(name, data) }
    }
  }

  private func track(_ task: URLSessionDownloadTask, _ name: String) {
    lock.lock()
    tasks[name] = task
    progress[name] = max(progress[name] ?? 0, 0)
    lock.unlock()
  }

  public func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64
  ) {
    guard let name = downloadTask.taskDescription, totalBytesExpectedToWrite > 0 else { return }
    lock.lock()
    progress[name] = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
    lock.unlock()
  }

  public func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    guard let name = downloadTask.taskDescription, let target = MapStore.shared.fileURL(name) else { return }
    let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else {
      finish(name, error: "http \(status)")
      return
    }
    do {
      try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
      let staged = target.appendingPathExtension("part")
      try? FileManager.default.removeItem(at: staged)
      try FileManager.default.moveItem(at: location, to: staged)
      MapDatabase.shared.close(name)
      if FileManager.default.fileExists(atPath: target.path) {
        _ = try FileManager.default.replaceItemAt(target, withItemAt: staged)
      } else {
        try FileManager.default.moveItem(at: staged, to: target)
      }
      clearResumeData(name)
      let bytes = (try? FileManager.default.attributesOfItem(atPath: target.path)[.size] as? NSNumber)?.doubleValue ?? 0
      finish(name, bytes: bytes)
    } catch {
      finish(name, error: error.localizedDescription)
    }
  }

  public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let name = task.taskDescription, let error else { return }
    let info = (error as NSError).userInfo
    if let data = info[NSURLSessionDownloadTaskResumeData] as? Data {
      saveResumeData(name, data)
    }
    finish(name, error: error.localizedDescription)
  }

  public func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    lock.lock()
    let handler = finishEvents
    finishEvents = nil
    lock.unlock()
    DispatchQueue.main.async { handler?() }
  }

  private func finish(_ name: String, bytes: Double = 0, error: String? = nil) {
    lock.lock()
    let waiter = waiters.removeValue(forKey: name)
    tasks.removeValue(forKey: name)
    if error == nil {
      progress[name] = 1
    } else {
      progress.removeValue(forKey: name)
    }
    lock.unlock()
    if let error {
      waiter?.reject(error)
    } else {
      waiter?.resolve(bytes)
    }
  }

  private func resumeURL(_ name: String) -> URL? {
    MapStore.shared.fileURL(name)?.appendingPathExtension("resume")
  }

  private func resumeData(_ name: String) -> Data? {
    guard let url = resumeURL(name) else { return nil }
    return try? Data(contentsOf: url)
  }

  private func saveResumeData(_ name: String, _ data: Data) {
    guard let url = resumeURL(name) else { return }
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? data.write(to: url, options: .atomic)
  }

  private func clearResumeData(_ name: String) {
    guard let url = resumeURL(name) else { return }
    try? FileManager.default.removeItem(at: url)
  }
}
