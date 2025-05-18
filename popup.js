let ws = null;
let stream = null;
let processor = null;
let audioContext = null;

document.getElementById("start").onclick = async () => {
  document.getElementById("status").textContent = "Starting...";
  chrome.tabCapture.capture({ audio: true, video: false }, function (capturedStream) {
    stream = capturedStream;
    ws = new WebSocket("wss://audio-stream-backend-688e.onrender.com");
    ws.binaryType = "arraybuffer";

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(8192, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = function (e) {
      let inputData = e.inputBuffer.getChannelData(0);

      // Check if it's silent (all zeros or near-zero)
      let isSilent = inputData.every(sample => Math.abs(sample) < 0.0001);

      // If silent, fill a dummy silent buffer
      if (isSilent) {
        inputData = new Float32Array(inputData.length); // zeroed out
      }

      const wav = encodeWAV(inputData, audioContext.sampleRate);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(wav);
      }
    };

    document.getElementById("status").textContent = "Streaming";
    document.getElementById("start").disabled = true;
    document.getElementById("stop").disabled = false;
  });
};

document.getElementById("stop").onclick = () => {
  if (processor) processor.disconnect();
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (ws) ws.close();
  if (audioContext) audioContext.close();

  document.getElementById("status").textContent = "Stopped";
  document.getElementById("start").disabled = false;
  document.getElementById("stop").disabled = true;
};

// WAV encoding function
function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}
