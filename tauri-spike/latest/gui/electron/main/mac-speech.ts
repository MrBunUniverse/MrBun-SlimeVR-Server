import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from './logger';

const execFileAsync = promisify(execFile);

const LANGUAGE_LOCALE_MAP: Record<string, string> = {
  auto: 'en-US',
  en: 'en-US',
  ja: 'ja-JP',
  th: 'th-TH',
  ko: 'ko-KR',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  zh: 'zh-CN',
  id: 'id-ID',
  vi: 'vi-VN',
  ru: 'ru-RU',
  pt: 'pt-BR',
  it: 'it-IT',
};

const SWIFT_SPEECH_SCRIPT = `
import Foundation
import Speech

let args = CommandLine.arguments
if args.count < 3 {
    print("ERROR: Missing arguments")
    exit(1)
}

let filePath = args[1]
let localeStr = args[2]

let locale = Locale(identifier: localeStr)
guard let recognizer = SFSpeechRecognizer(locale: locale) else {
    print("ERROR: Recognizer unavailable for locale \\(localeStr)")
    exit(1)
}

let fileUrl = URL(fileURLWithPath: filePath)
let request = SFSpeechURLRecognitionRequest(url: fileUrl)
request.shouldReportPartialResults = false

var finalOutput = ""
var hasExited = false

let task = recognizer.recognitionTask(with: request) { result, error in
    if let error = error {
        if !hasExited {
            hasExited = true
            print("ERROR: \\(error.localizedDescription)")
            CFRunLoopStop(CFRunLoopGetMain())
        }
        return
    }
    if let result = result, result.isFinal {
        if !hasExited {
            hasExited = true
            finalOutput = result.bestTranscription.formattedString
            print("FINAL: \\(finalOutput)")
            CFRunLoopStop(CFRunLoopGetMain())
        }
    }
}

DispatchQueue.main.asyncAfter(deadline: .now() + 10.0) {
    if !hasExited {
        hasExited = true
        task.cancel()
        if !finalOutput.isEmpty {
            print("FINAL: \\(finalOutput)")
        } else {
            print("ERROR: Recognition timeout")
        }
        CFRunLoopStop(CFRunLoopGetMain())
    }
}

CFRunLoopRun()
`;

let cachedScriptPath: string | null = null;

async function getSwiftScriptPath(): Promise<string> {
  if (cachedScriptPath) return cachedScriptPath;

  const tempDir = path.join(tmpdir(), 'slimevr_native_speech');
  await mkdir(tempDir, { recursive: true });
  const scriptPath = path.join(tempDir, 'speech_recognizer.swift');
  await writeFile(scriptPath, SWIFT_SPEECH_SCRIPT, 'utf-8');
  cachedScriptPath = scriptPath;
  return scriptPath;
}

export async function transcribeWithMacSpeech(data: {
  audioBase64: string;
  language?: string;
}): Promise<{ success: boolean; text?: string; error?: string }> {
  if (process.platform !== 'darwin') {
    return {
      success: false,
      error: 'Native Apple Speech is only available on macOS.',
    };
  }

  if (!data.audioBase64) {
    return { success: false, error: 'Empty audio buffer provided.' };
  }

  const fileId = crypto.randomBytes(8).toString('hex');
  const tempWavPath = path.join(tmpdir(), `slimevr_speech_${fileId}.wav`);

  try {
    const audioBuffer = Buffer.from(data.audioBase64, 'base64');
    await writeFile(tempWavPath, audioBuffer);

    const scriptPath = await getSwiftScriptPath();
    const targetLocale =
      LANGUAGE_LOCALE_MAP[data.language || 'auto'] || LANGUAGE_LOCALE_MAP.en || 'en-US';

    const { stdout, stderr } = await execFileAsync(
      'swift',
      [scriptPath, tempWavPath, targetLocale],
      { timeout: 12000 }
    );

    const output = (stdout || '').trim();
    if (output.startsWith('FINAL:')) {
      const text = output.replace(/^FINAL:\s*/, '').trim();
      return { success: true, text };
    }

    if (output.startsWith('ERROR:')) {
      const errMsg = output.replace(/^ERROR:\s*/, '').trim();
      logger.warn({ errMsg }, '[MacSpeech] Swift error');
      return { success: false, error: errMsg };
    }

    if (stderr && !output) {
      logger.warn({ stderr }, '[MacSpeech] Swift stderr');
      return { success: false, error: stderr.trim() };
    }

    return { success: true, text: output };
  } catch (err: any) {
    logger.error({ err }, '[MacSpeech] Transcription failed');
    return {
      success: false,
      error: err.message || 'macOS Speech Recognition failed',
    };
  } finally {
    try {
      await unlink(tempWavPath);
    } catch {
      // ignore
    }
  }
}
