// WebSocket and WebRTC setup
const WS_URL = 'ws://localhost:3000';
let socket;
let selfInfo = null;
let peers = new Map(); // id -> user info
let selectedPeerId = null;
let peerConnection = null;
let dataChannel = null;
let fileToSend = null;
let receivedFileChunks = [];
let receivedFileName = '';
let receivedFileType = '';
let receivedFileSize = 0;
let receivedBytes = 0;

// DOM elements
const selfIdElement = document.getElementById('selfId');
const selfNameElement = document.getElementById('selfName');
const peersListElement = document.getElementById('peersList');
const fileTransferSection = document.getElementById('fileTransferSection');
const selectedPeerElement = document.getElementById('selectedPeer');
const connectionStatusElement = document.getElementById('connectionStatus');
const fileInput = document.getElementById('fileInput');
const sendFileBtn = document.getElementById('sendFileBtn');
const fileTransferProgress = document.getElementById('fileTransferProgress');
const receivedFilesElement = document.getElementById('receivedFiles');

// Connect to WebSocket server
function connectWebSocket() {
  console.log(`Attempting to connect to WebSocket server at ${WS_URL}`);
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    console.log('Connected to WebSocket server successfully');
    updateStatus('WebSocket connected, waiting for self info...');
  };

  socket.onclose = (event) => {
    console.log(`Disconnected from WebSocket server: code=${event.code}, reason=${event.reason}`);
    updateStatus('WebSocket disconnected, trying to reconnect...');
    // Try to reconnect after a few seconds
    setTimeout(connectWebSocket, 3000);
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    updateStatus('WebSocket error occurred');
  };

  socket.onmessage = (event) => {
    // console.log('WebSocket message received:', event.data.substring(0, 100) + (event.data.length > 100 ? '...' : ''));
    try {
      const message = JSON.parse(event.data);
      handleSignalingMessage(message);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };
}

// Helper to update connection status with timestamps
function updateStatus(status) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] Status: ${status}`);
  connectionStatusElement.textContent = status;
}

// Handle signaling messages
function handleSignalingMessage(message) {
  // console.log('Handling signaling message:', message.type, message);
  switch (message.type) {
    case 'client_self':
      selfInfo = message.data;
      selfIdElement.textContent = selfInfo.id;
      selfNameElement.textContent = selfInfo.name;
      console.log('Received self info:', selfInfo);
      updateStatus('Connected as ' + selfInfo.name);
      break;
    
    case 'client_connect':
      const peerInfo = message.data;

      if (selfInfo && selfInfo.id === peerInfo.id) {
        break;
      } else if (peers.has(peerInfo.id)) {
        console.log('Peer already exists:', peerInfo.id);
      } else {
        console.log('New peer connected:', peerInfo);
        peers.set(peerInfo.id, peerInfo);
        updatePeersList();
      }
      break;
    
    case 'client_disconnect':
      const disconnectedPeerId = message.data.id;
      console.log('Peer disconnected:', disconnectedPeerId);
      peers.delete(disconnectedPeerId);
      
      if (selectedPeerId === disconnectedPeerId) {
        console.log('Selected peer disconnected, resetting connection');
        resetConnection();
      }
      
      updatePeersList();
      break;
    
    case 'rtc_offer':
      console.log('Received RTC offer from:', message.sender);
      // Auto-select the peer if they sent us an offer and we haven't selected anyone
      if (!selectedPeerId && peers.has(message.sender)) {
        console.log('Auto-selecting peer that sent us an offer:', message.sender);
        selectPeer(message.sender);
      }
      handleRTCOffer(message.sender, message.data);
      break;
    
    case 'rtc_answer':
      console.log('Received RTC answer from:', message.sender);
      handleRTCAnswer(message.sender, message.data);
      break;
    
    case 'rtc_ice_candidate':
      console.log('Received ICE candidate from:', message.sender);
      handleICECandidate(message.sender, message.data);
      break;
    
    default:
      console.log('Unhandled message type:', message.type);
  }
}

// Update the list of available peers
function updatePeersList() {
  if (peers.size === 0) {
    peersListElement.textContent = 'No peers available';
    return;
  }

  peersListElement.innerHTML = '';
  
  peers.forEach((peer, id) => {
    const peerElement = document.createElement('div');
    peerElement.classList.add('peer-item');
    if (id === selectedPeerId) {
      peerElement.classList.add('selected');
    }
    
    peerElement.textContent = `${peer.name} (${peer.device})`;
    peerElement.addEventListener('click', () => selectPeer(id));
    
    peersListElement.appendChild(peerElement);
  });
}

// Select a peer to establish a connection
function selectPeer(peerId) {
  console.log('Selecting peer:', peerId);
  // If selecting the same peer, do nothing
  if (peerId === selectedPeerId) {
    console.log('Already connected to this peer');
    return;
  }
  
  // If there was a previous connection, clean it up
  if (selectedPeerId) {
    console.log('Cleaning up previous connection to:', selectedPeerId);
    resetConnection();
  }
  
  selectedPeerId = peerId;
  const peer = peers.get(peerId);
  
  selectedPeerElement.textContent = peer.name;
  updateStatus('Initiating connection to ' + peer.name);
  fileTransferSection.classList.remove('hidden');
  
  // Update the selected peer in the UI
  updatePeersList();
  
  // Initiate WebRTC connection
  createPeerConnection();
  createDataChannel();
  createOffer();
}

// Create a WebRTC peer connection
function createPeerConnection() {
  console.log('Creating peer connection');
  
  // Close any existing connection
  if (peerConnection) {
    console.log('Closing existing peer connection before creating new one');
    peerConnection.close();
  }
  
  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });
  
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Generated ICE candidate:', event.candidate.candidate);
      sendSignalingMessage('rtc_ice_candidate', event.candidate);
    } else {
      console.log('ICE candidate generation complete');
    }
  };
  
  peerConnection.onicegatheringstatechange = () => {
    console.log('ICE gathering state changed:', peerConnection.iceGatheringState);
  };
  
  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE connection state changed:', peerConnection.iceConnectionState);
    updateStatus(`ICE connection: ${peerConnection.iceConnectionState}`);
    
    // Handle failed connection
    if (peerConnection.iceConnectionState === 'failed') {
      console.log('ICE connection failed, trying to restart ICE');
      peerConnection.restartIce();
    }
  };
  
  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state changed:', peerConnection.connectionState);
    updateStatus(`Connection: ${peerConnection.connectionState}`);
    
    if (peerConnection.connectionState === 'connected') {
      console.log('Peer connection established successfully');
      sendFileBtn.disabled = false;
    } else {
      sendFileBtn.disabled = true;
    }
    
    // Handle disconnection
    if (peerConnection.connectionState === 'disconnected' || 
        peerConnection.connectionState === 'failed' ||
        peerConnection.connectionState === 'closed') {
      console.log('Connection lost or failed');
      // Only reset if this wasn't triggered by our own reset call
      if (selectedPeerId) {
        updateStatus('Connection lost, you may need to reconnect');
      }
    }
  };
  
  peerConnection.onsignalingstatechange = () => {
    console.log('AA Signaling state changed:', peerConnection.signalingState);
  };
  
  peerConnection.ondatachannel = (event) => {
    console.log('Remote data channel received:', event.channel.label);
    setupDataChannel(event.channel);
  };
}

// Create a data channel for file transfer
function createDataChannel() {
  console.log('Creating data channel');
  try {
    dataChannel = peerConnection.createDataChannel('fileTransfer', {
      ordered: true
    });
    
    console.log('Data channel created successfully:', dataChannel.label);
    setupDataChannel(dataChannel);
  } catch (error) {
    console.error('Error creating data channel:', error);
    updateStatus('Failed to create data channel');
  }
}

// Set up data channel event handlers
function setupDataChannel(channel) {
  console.log('Setting up data channel:', channel.label);
  dataChannel = channel;
  
  dataChannel.onopen = () => {
    console.log('Data channel open');
    updateStatus('Data channel open - ready to transfer files');
    sendFileBtn.disabled = false;
  };
  
  dataChannel.onclose = () => {
    console.log('Data channel closed');
    updateStatus('Data channel closed');
    sendFileBtn.disabled = true;
  };
  
  dataChannel.onerror = (error) => {
    console.error('Data channel error:', error);
    updateStatus('Data channel error occurred');
  };
  
  dataChannel.onmessage = (event) => {
    // Handle received file chunks or metadata
    const data = event.data;
    
    // If it's a string, it's probably metadata
    if (typeof data === 'string') {
      try {
        const metadata = JSON.parse(data);
        if (metadata.type === 'file-metadata') {
          console.log('Receiving file:', metadata.name, 'size:', metadata.size);
          // Start receiving a new file
          receivedFileName = metadata.name;
          receivedFileType = metadata.fileType;
          receivedFileSize = metadata.size;
          receivedBytes = 0;
          receivedFileChunks = [];
          
          // Update progress bar
          fileTransferProgress.value = 0;
          fileTransferProgress.max = 100;
          updateStatus(`Receiving file: ${metadata.name}`);
        }
      } catch (error) {
        console.error('Error parsing file metadata:', error);
      }
    } else {
      // It's a file chunk, add it to the chunks array
      receivedFileChunks.push(data);
      
      // Ensure we're getting a valid size from ArrayBuffer or Blob
      let chunkSize = 0;
      if (data instanceof ArrayBuffer) {
        chunkSize = data.byteLength;
      } else if (data instanceof Blob) {
        chunkSize = data.size;
      } else {
        console.warn('Received unknown data type:', typeof data);
        chunkSize = 0;
      }
      
      receivedBytes += chunkSize;
      
      if (receivedFileChunks.length % 10 === 0) {
        console.log(`Received ${receivedFileChunks.length} chunks (${receivedBytes}/${receivedFileSize} bytes)`);
      }
      
      // Update progress - ensure we have a valid number calculation
      let progress = 0;
      if (receivedFileSize > 0) {
        progress = Math.min(100, Math.floor((receivedBytes / receivedFileSize) * 100));
      }
      fileTransferProgress.value = progress;
      
      // If we've received all the data, assemble the file
      if (receivedBytes >= receivedFileSize) {
        console.log('File transfer complete, assembling file');
        assembleReceivedFile();
      }
    }
  };
}

// Assemble received file chunks into a complete file
function assembleReceivedFile() {
  console.log('Assembling received file from', receivedFileChunks.length, 'chunks');
  const fileBlob = new Blob(receivedFileChunks, { type: receivedFileType });
  const fileUrl = URL.createObjectURL(fileBlob);
  
  console.log('File assembled:', receivedFileName, fileBlob.size, 'bytes');
  
  // Add file to the list of received files
  const fileItem = document.createElement('li');
  
  const fileLink = document.createElement('a');
  fileLink.href = fileUrl;
  fileLink.textContent = receivedFileName;
  fileLink.download = receivedFileName;
  
  fileItem.appendChild(fileLink);
  fileItem.appendChild(document.createTextNode(` (${formatFileSize(receivedFileSize)})`));
  
  receivedFilesElement.appendChild(fileItem);
  updateStatus(`File received: ${receivedFileName}`);
  
  // Reset file transfer state
  receivedFileChunks = [];
  receivedFileName = '';
  receivedFileType = '';
  receivedFileSize = 0;
  receivedBytes = 0;
}

// Create an offer to establish WebRTC connection
function createOffer() {
  console.log('Creating offer');
  peerConnection.createOffer()
    .then(offer => {
      console.log('Offer created:', offer.sdp.substring(0, 100) + '...');
      return peerConnection.setLocalDescription(offer);
    })
    .then(() => {
      console.log('Local description set, sending offer');
      sendSignalingMessage('rtc_offer', peerConnection.localDescription);
    })
    .catch(error => {
      console.error('Error creating offer:', error);
      updateStatus('Failed to create connection offer');
    });
}

// Handle received offer
function handleRTCOffer(senderId, offer) {
  console.log('Processing RTC offer from:', senderId);
  
  // Only process offers from the selected peer or auto-select if none selected
  if (selectedPeerId && senderId !== selectedPeerId) {
    console.log('Ignoring offer from non-selected peer:', senderId);
    return;
  }
  
  // If we don't have this peer selected yet, select them now
  if (!selectedPeerId && peers.has(senderId)) {
    console.log('Auto-selecting peer that sent offer:', senderId);
    selectPeer(senderId);
    // Don't create a new peer connection since selectPeer already did that
    
    // Now we handle the offer
    console.log('Setting remote description from offer');
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
      .then(() => {
        console.log('Remote description set, creating answer');
        return peerConnection.createAnswer();
      })
      .then(answer => {
        console.log('Answer created:', answer.sdp.substring(0, 100) + '...');
        return peerConnection.setLocalDescription(answer);
      })
      .then(() => {
        console.log('Local description set, sending answer');
        sendSignalingMessage('rtc_answer', peerConnection.localDescription);
      })
      .catch(error => {
        console.error('Error handling offer:', error);
        updateStatus('Failed to process connection offer');
      });
    return;
  }
  
  // If we already selected this peer, handle the offer
  console.log('Creating peer connection for incoming offer');
  if (peerConnection) {
    console.log('Closing existing peer connection before creating new one');
    peerConnection.close();
    peerConnection = null;
  }
  
  createPeerConnection();
  
  console.log('Setting remote description from offer');
  peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    .then(() => {
      console.log('Remote description set, creating answer');
      return peerConnection.createAnswer();
    })
    .then(answer => {
      console.log('Answer created:', answer.sdp.substring(0, 100) + '...');
      return peerConnection.setLocalDescription(answer);
    })
    .then(() => {
      console.log('Local description set, sending answer');
      sendSignalingMessage('rtc_answer', peerConnection.localDescription);
    })
    .catch(error => {
      console.error('Error handling offer:', error);
      updateStatus('Failed to process connection offer');
    });
}

// Handle received answer
function handleRTCAnswer(senderId, answer) {
  console.log('Processing RTC answer from:', senderId);
  // Only process answers from the selected peer
  if (senderId !== selectedPeerId) {
    console.log('Ignoring answer from non-selected peer:', senderId);
    return;
  }
  
  console.log('Setting remote description from answer');
  peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
    .then(() => {
      console.log('Remote description set successfully');
    })
    .catch(error => {
      console.error('Error handling answer:', error);
      updateStatus('Failed to process connection answer');
    });
}

// Handle received ICE candidate
function handleICECandidate(senderId, candidate) {
  // Only process candidates from the selected peer
  if (senderId !== selectedPeerId) {
    console.log('Ignoring ICE candidate from non-selected peer:', senderId);
    return;
  }
  
  console.log('Adding ICE candidate:', candidate.candidate);
  peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    .then(() => {
      console.log('ICE candidate added successfully');
    })
    .catch(error => {
      console.error('Error adding ICE candidate:', error);
      updateStatus('Failed to add ICE candidate');
    });
}

// Send a signaling message through the WebSocket
function sendSignalingMessage(type, data) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket not open, cannot send message');
    return;
  }
  
  if (!selectedPeerId) {
    console.error('No peer selected, cannot send message');
    return;
  }
  
  const message = {
    type,
    data,
    to: selectedPeerId
  };
  
  try {
    console.log('Sending signaling message:', type, 'to:', selectedPeerId);
    socket.send(JSON.stringify(message));
  } catch (error) {
    console.error('Error sending signaling message:', error);
    updateStatus('Failed to send signaling message');
  }
}

// Reset the connection
function resetConnection() {
  console.log('Resetting connection');
  
  if (dataChannel) {
    console.log('Closing data channel');
    dataChannel.close();
  }
  
  if (peerConnection) {
    console.log('Closing peer connection');
    peerConnection.close();
  }
  
  dataChannel = null;
  peerConnection = null;
  selectedPeerId = null;
  sendFileBtn.disabled = true;
  fileTransferSection.classList.add('hidden');
  updateStatus('Connection reset');
}

// Format file size in human-readable format
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return bytes + ' bytes';
  } else if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(2) + ' KB';
  } else if (bytes < 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  } else {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
}

// Send a file to the selected peer
function sendFile() {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    console.error('Data channel not open, cannot send file');
    updateStatus('Data channel not open, cannot send file');
    return;
  }
  
  const file = fileInput.files[0];
  if (!file) {
    console.error('No file selected');
    updateStatus('Please select a file to send');
    return;
  }
  
  console.log('Sending file:', file.name, file.size, 'bytes');
  
  // First, send file metadata
  const metadata = {
    type: 'file-metadata',
    name: file.name,
    fileType: file.type,
    size: file.size
  };
  
  console.log('Sending file metadata:', metadata);
  dataChannel.send(JSON.stringify(metadata));
  
  // Then, start sending the file in chunks
  const chunkSize = 16 * 1024; // 16 KB chunks
  const bufferThreshold = 1024 * 1024; // 1MB buffer threshold
  let offset = 0;
  let chunkCount = 0;
  let sending = true;
  
  // Reset progress
  fileTransferProgress.value = 0;
  fileTransferProgress.max = 100;
  updateStatus(`Sending file: ${file.name}`);
  
  // Add buffer monitoring
  dataChannel.bufferedAmountLowThreshold = bufferThreshold / 2;
  dataChannel.onbufferedamountlow = () => {
    if (!sending) {
      console.log('Buffer low event, resuming sending');
      sending = true;
      readNextChunk();
    }
  };
  
  function readAndSendChunk() {
    // Check if buffer is getting full
    if (dataChannel.bufferedAmount > bufferThreshold) {
      console.log(`Data channel buffer full (${dataChannel.bufferedAmount} bytes), pausing send`);
      sending = false;
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        dataChannel.send(e.target.result);
        offset += e.target.result.byteLength;
        chunkCount++;
        
        if (chunkCount % 10 === 0) {
          console.log(`Sent ${chunkCount} chunks (${offset}/${file.size} bytes), buffer: ${dataChannel.bufferedAmount}`);
        }
        
        // Update progress
        const progress = Math.min(100, Math.floor((offset / file.size) * 100));
        fileTransferProgress.value = progress;
        
        // If there's more data to send, continue
        if (offset < file.size) {
          readNextChunk();
        } else {
          console.log('File sending complete:', chunkCount, 'chunks sent');
          updateStatus(`File sent: ${file.name}`);
        }
      } catch (error) {
        console.error('Error sending chunk:', error);
        // If send queue is full, wait and try again
        if (error.name === 'OperationError' && error.message.includes('send queue is full')) {
          console.log('Send queue full, waiting to retry...');
          sending = false;
        }
      }
    };
    
    reader.onerror = (error) => {
      console.error('Error reading file:', error);
      updateStatus('Error reading file');
    };
    
    const slice = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(slice);
  }
  
  function readNextChunk() {
    if (!sending) return;
    
    // Use setTimeout to avoid blocking the UI and give the browser a chance to send data
    setTimeout(readAndSendChunk, 0);
  }
  
  readNextChunk();
}

// Event listeners
sendFileBtn.addEventListener('click', sendFile);

// Initialize
console.log('Initializing WebRTC file transfer application');
updateStatus('Connecting to server...');
connectWebSocket(); 