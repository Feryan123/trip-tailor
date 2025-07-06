let mediaRecorder;
let audioChunks = [];

const recordBtn = document.getElementById('recordBtn');
const chatDisplay = document.getElementById('chatDisplay');

// Start/Stop recording
recordBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    recordBtn.textContent = '🎤 Record Voice';
  } else {
    await startRecording();
    recordBtn.textContent = '⏹️ Stop Recording';
  }
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      await sendVoiceMessage(audioBlob);
      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start();
  } catch (error) {
    console.error('Error starting recording:', error);
  }
}

async function sendVoiceMessage(audioBlob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'voice-message.wav');

  try {
    chatDisplay.innerHTML += '<div>🎤 Processing your voice...</div>';
    
    const response = await fetch('/api/chat/voice', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    
    if (result.success) {
      chatDisplay.innerHTML += `
        <div><strong>You:</strong> ${result.userMessage}</div>
        <div><strong>Bot:</strong> ${result.botResponse}</div>
      `;
    } else {
      chatDisplay.innerHTML += '<div>Error processing voice message</div>';
    }
  } catch (error) {
    console.error('Error sending voice message:', error);
    chatDisplay.innerHTML += '<div>Error sending voice message</div>';
  }
}