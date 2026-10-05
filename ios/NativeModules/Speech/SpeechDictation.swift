import AVFoundation
import Speech

/// One listen at a time. Resolves with the phrase after a short pause, or when stopped.
@objc public final class SpeechDictation: NSObject {
  @objc public static let shared = SpeechDictation()

  private let engine = AVAudioEngine()
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var completion: ((String?, String?) -> Void)?
  private var latest = ""
  private var settled = false
  private var tapInstalled = false
  private var silence: Timer?

  @objc public func listen(_ language: String, completion: @escaping (String?, String?) -> Void) {
    DispatchQueue.main.async {
      self.abandon()
      self.completion = completion
      self.latest = ""
      self.settled = false
      SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
          guard status == .authorized else {
            self.finish(text: nil, error: "denied")
            return
          }
          AVAudioSession.sharedInstance().requestRecordPermission { allowed in
            DispatchQueue.main.async {
              guard allowed else {
                self.finish(text: nil, error: "denied")
                return
              }
              self.start(language)
            }
          }
        }
      }
    }
  }

  @objc public func stop() {
    DispatchQueue.main.async {
      guard !self.settled else { return }
      let text = self.latest.trimmingCharacters(in: .whitespacesAndNewlines)
      self.finish(text: text.isEmpty ? nil : text, error: text.isEmpty ? "cancelled" : nil)
    }
  }

  private func start(_ language: String) {
    guard !settled else { return }
    let locale = Locale(identifier: language)
    guard let recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer(), recognizer.isAvailable else {
      finish(text: nil, error: "unavailable")
      return
    }
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .default, options: [.duckOthers, .defaultToSpeaker])
      try session.setActive(true, options: .notifyOthersOnDeactivation)
    } catch {
      finish(text: nil, error: "unavailable")
      return
    }
    let recognition = SFSpeechAudioBufferRecognitionRequest()
    recognition.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition {
      recognition.requiresOnDeviceRecognition = false
    }
    request = recognition
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      finish(text: nil, error: "unavailable")
      return
    }
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      self?.request?.append(buffer)
    }
    tapInstalled = true
    engine.prepare()
    do {
      try engine.start()
    } catch {
      finish(text: nil, error: "unavailable")
      return
    }
    task = recognizer.recognitionTask(with: recognition) { [weak self] result, error in
      DispatchQueue.main.async {
        guard let self, !self.settled else { return }
        if let result {
          self.latest = result.bestTranscription.formattedString
          if result.isFinal {
            let text = self.latest.trimmingCharacters(in: .whitespacesAndNewlines)
            self.finish(text: text.isEmpty ? nil : text, error: text.isEmpty ? "empty" : nil)
            return
          }
          self.armSilence()
        }
        if error != nil, self.latest.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          self.finish(text: nil, error: "empty")
        }
      }
    }
    silence = Timer.scheduledTimer(withTimeInterval: 12, repeats: false) { [weak self] _ in
      self?.stop()
    }
  }

  private func armSilence() {
    silence?.invalidate()
    silence = Timer.scheduledTimer(withTimeInterval: 1.3, repeats: false) { [weak self] _ in
      guard let self, !self.settled else { return }
      let text = self.latest.trimmingCharacters(in: .whitespacesAndNewlines)
      self.finish(text: text.isEmpty ? nil : text, error: text.isEmpty ? "empty" : nil)
    }
  }

  private func abandon() {
    tearDownAudio()
    silence?.invalidate()
    silence = nil
    let pending = completion
    completion = nil
    settled = true
    pending?(nil, "cancelled")
  }

  private func finish(text: String?, error: String?) {
    guard !settled else { return }
    settled = true
    tearDownAudio()
    silence?.invalidate()
    silence = nil
    let pending = completion
    completion = nil
    pending?(text, error)
  }

  private func tearDownAudio() {
    if engine.isRunning {
      engine.stop()
    }
    if tapInstalled {
      engine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    request?.endAudio()
    task?.cancel()
    request = nil
    task = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
