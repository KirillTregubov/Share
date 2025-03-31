// WebSocket and WebRTC setup
const WS_URL = 'ws://localhost:3000';
let socket;
let selfInfo = null;
let peers = new Map(); // id -> user info
let selectedPeerId = null;
let peerConnection = null;
let dataChannel = null;
let fileToSend = null;

// Reliable file transfer variables
let currentTransferId = '';
let sentChunks = {}; // Track sent chunks by sequence: { sequence: { sent: bool, acked: bool } }
let receivedChunks = {}; // Track received chunks by sequence
let totalChunksToReceive = 0;
let currentChunkSequence = null;
let retryTimeoutId = null;
let missingChunksCheckInterval = null;

// In-memory fallback (when IndexedDB not available)
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

// IndexedDB setup for file chunk storage
const DB_NAME = 'FileTransferDB';
const CHUNK_STORE = 'chunks';
const META_STORE = 'metadata';
let db = null;

// Initialize IndexedDB
function initDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB not supported, falling back to in-memory storage');
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      resolve(null); // Fall back to in-memory
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create chunk store with transferId and sequence as compound key
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const chunkStore = db.createObjectStore(CHUNK_STORE, { keyPath: ['transferId', 'sequence'] });
        chunkStore.createIndex('transferId', 'transferId', { unique: false });
      }
      
      // Create metadata store
      if (!db.objectStoreNames.contains(META_STORE)) {
        const metaStore = db.createObjectStore(META_STORE, { keyPath: 'transferId' });
      }
    };
    
    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('IndexedDB initialized successfully');
      resolve(db);
    };
  });
}

// Store a chunk in IndexedDB
function storeChunk(transferId, sequence, data) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(false);
      return;
    }
    
    try {
      const transaction = db.transaction([CHUNK_STORE], 'readwrite');
      const store = transaction.objectStore(CHUNK_STORE);
      
      const chunk = {
        transferId,
        sequence,
        data,
        timestamp: Date.now()
      };
      
      const request = store.put(chunk);
      
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => {
        console.error('Error storing chunk:', e.target.error);
        resolve(false);
      };
    } catch (e) {
      console.error('Exception storing chunk:', e);
      resolve(false);
    }
  });
}

// Store file metadata in IndexedDB
function storeFileMetadata(metadata) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(false);
      return;
    }
    
    try {
      const transaction = db.transaction([META_STORE], 'readwrite');
      const store = transaction.objectStore(META_STORE);
      
      const request = store.put({
        ...metadata,
        receivedChunks: 0,
        status: 'in_progress',
        timestamp: Date.now()
      });
      
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => {
        console.error('Error storing metadata:', e.target.error);
        resolve(false);
      };
    } catch (e) {
      console.error('Exception storing metadata:', e);
      resolve(false);
    }
  });
}

// Get all chunks for a transfer
function getChunks(transferId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve([]);
      return;
    }
    
    try {
      const transaction = db.transaction([CHUNK_STORE], 'readonly');
      const store = transaction.objectStore(CHUNK_STORE);
      const index = store.index('transferId');
      
      const request = index.getAll(transferId);
      
      request.onsuccess = () => {
        const chunks = request.result;
        resolve(chunks.sort((a, b) => a.sequence - b.sequence));
      };
      
      request.onerror = (e) => {
        console.error('Error getting chunks:', e.target.error);
        resolve([]);
      };
    } catch (e) {
      console.error('Exception getting chunks:', e);
      resolve([]);
    }
  });
}

// Delete a completed transfer
function deleteTransfer(transferId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(false);
      return;
    }
    
    try {
      // Delete chunks
      let transaction = db.transaction([CHUNK_STORE], 'readwrite');
      let store = transaction.objectStore(CHUNK_STORE);
      let index = store.index('transferId');
      
      const chunksRequest = index.getAllKeys(transferId);
      
      chunksRequest.onsuccess = () => {
        const keys = chunksRequest.result;
        
        // Delete each chunk
        const chunkTransaction = db.transaction([CHUNK_STORE], 'readwrite');
        const chunkStore = chunkTransaction.objectStore(CHUNK_STORE);
        
        keys.forEach(key => {
          chunkStore.delete(key);
        });
        
        // Delete metadata
        const metaTransaction = db.transaction([META_STORE], 'readwrite');
        const metaStore = metaTransaction.objectStore(META_STORE);
        metaStore.delete(transferId);
        
        resolve(true);
      };
      
      chunksRequest.onerror = (e) => {
        console.error('Error deleting transfer:', e.target.error);
        resolve(false);
      };
    } catch (e) {
      console.error('Exception deleting transfer:', e);
      resolve(false);
    }
  });
}

// Mark a transfer as completed
function completeTransfer(transferId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(false);
      return;
    }
    
    try {
      // Delete chunks (we still delete chunks to save space)
      let transaction = db.transaction([CHUNK_STORE], 'readwrite');
      let store = transaction.objectStore(CHUNK_STORE);
      let index = store.index('transferId');
      
      const chunksRequest = index.getAllKeys(transferId);
      
      chunksRequest.onsuccess = () => {
        const keys = chunksRequest.result;
        
        // Delete each chunk
        const chunkTransaction = db.transaction([CHUNK_STORE], 'readwrite');
        const chunkStore = chunkTransaction.objectStore(CHUNK_STORE);
        
        keys.forEach(key => {
          chunkStore.delete(key);
        });
        
        // Update metadata status to completed
        const metaTransaction = db.transaction([META_STORE], 'readwrite');
        const metaStore = metaTransaction.objectStore(META_STORE);
        
        const getRequest = metaStore.get(transferId);
        
        getRequest.onsuccess = () => {
          const metadata = getRequest.result;
          if (metadata) {
            metadata.status = 'completed';
            metadata.completedAt = Date.now();
            metaStore.put(metadata);
            console.log(`Transfer ${transferId} marked as completed`);
            resolve(true);
          } else {
            console.warn(`Cannot update status: Transfer ${transferId} not found`);
            resolve(false);
          }
        };
        
        getRequest.onerror = (e) => {
          console.error('Error getting metadata:', e.target.error);
          resolve(false);
        };
      };
      
      chunksRequest.onerror = (e) => {
        console.error('Error completing transfer:', e.target.error);
        resolve(false);
      };
    } catch (e) {
      console.error('Exception completing transfer:', e);
      resolve(false);
    }
  });
}

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
async function handleSignalingMessage(message) {
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
    
    case 'transfer-complete':
      // Sender indicates all chunks sent
      console.log('Sender marked transfer as complete, checking for missing chunks...');
      const missingChunks = findMissingChunks();
      if (missingChunks.length === 0) {
        await assembleAndSaveFile();
      } else {
        console.log(`Missing ${missingChunks.length} chunks, requesting them...`);
        requestMissingChunks(missingChunks);
      }
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
    
    // Clean up any ongoing transfers
    clearTimeout(retryTimeoutId);
    clearInterval(missingChunksCheckInterval);
  };
  
  dataChannel.onerror = (error) => {
    console.error('Data channel error:', error);
    updateStatus('Data channel error occurred');
  };
  
  dataChannel.onmessage = async (event) => {
    const data = event.data;
    
    // Handle string messages (metadata, control messages)
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        
        switch (message.type) {
          case 'file-metadata':
            // Start receiving a new file
            console.log('Receiving file:', message.name, 'size:', message.size);
            
            // Clear any existing transfer
            clearTimeout(retryTimeoutId);
            clearInterval(missingChunksCheckInterval);
            
            // Setup new transfer
            currentTransferId = message.transferId || `transfer-${Date.now()}`;
            receivedFileName = message.name;
            receivedFileType = message.fileType;
            receivedFileSize = message.size;
            totalChunksToReceive = message.totalChunks;
            receivedBytes = 0;
            receivedChunks = {};
            
            // Store metadata
            await storeFileMetadata({
              transferId: currentTransferId,
              name: receivedFileName,
              fileType: receivedFileType,
              size: receivedFileSize,
              totalChunks: totalChunksToReceive,
              chunkSize: message.chunkSize || 16384
            });
            
            // Use in-memory fallback if needed
            if (!db) {
              receivedFileChunks = [];
            }
            
            // Start tracking for missing chunks
            startMissingChunksCheck();
            
            // Update progress bar
            fileTransferProgress.value = 0;
            fileTransferProgress.max = 100;
            updateStatus(`Receiving file: ${receivedFileName}`);
            break;
            
          case 'chunk-metadata':
            // Prepare to receive next chunk data
            currentChunkSequence = message.sequence;
            break;
            
          case 'chunk-ack':
            // Sender received acknowledgment of a chunk
            if (sentChunks[message.sequence]) {
              sentChunks[message.sequence].acked = true;
            }
            break;
            
          case 'retry-request':
            // Receiver is requesting a missing chunk
            console.log(`Received retry request for chunk ${message.sequence}`);
            if (message.transferId === currentTransferId) {
              sendChunk(message.sequence);
            }
            break;
            
          case 'transfer-complete':
            // Sender indicates all chunks sent
            console.log('Sender marked transfer as complete, checking for missing chunks...');

            const missingChunks = findMissingChunks();
            if (missingChunks.length === 0) {
              await assembleAndSaveFile();
            } else {
              console.log(`Missing ${missingChunks.length} chunks, requesting them...`);
              requestMissingChunks(missingChunks);
            }
            break;
            
          default:
            console.log('Unhandled message type:', message.type);
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    } else {
      // Binary data - must be a file chunk
      if (currentChunkSequence !== null) {
        // Process and store the chunk
        const sequence = currentChunkSequence;
        currentChunkSequence = null;
        
        // Ensure we're getting a valid size from ArrayBuffer or Blob
        let chunkSize = 0;
        if (data instanceof ArrayBuffer) {
          chunkSize = data.byteLength;
        } else if (data instanceof Blob) {
          chunkSize = data.size;
        } else {
          console.warn('Received unknown data type:', typeof data);
          chunkSize = data.byteLength || data.size || 0;
        }
        
        receivedBytes += chunkSize;
        receivedChunks[sequence] = true;
        
        // Store in IndexedDB if available, otherwise in memory
        const storedInDb = await storeChunk(currentTransferId, sequence, data);
        
        if (!storedInDb) {
          // Fallback to memory storage
          if (!db) {
            receivedFileChunks[sequence] = data;
          }
        }
        
        // Send acknowledgment
        sendChunkAcknowledgment(sequence);
        
        // Log progress periodically and update metadata
        if (Object.keys(receivedChunks).length % 10 === 0) {
          console.log(`Received ${Object.keys(receivedChunks).length}/${totalChunksToReceive} chunks (${receivedBytes}/${receivedFileSize} bytes)`);
          
          // Update metadata with current progress
          if (db && currentTransferId) {
            const receivedCount = Object.keys(receivedChunks).length;
            updateReceivedChunksCount(currentTransferId, receivedCount)
              .catch(error => console.error('Failed to update received chunks count:', error));
          }
        }
        
        // Update progress - ensure we have a valid number calculation
        let progress = 0;
        if (receivedFileSize > 0) {
          progress = Math.min(100, Math.floor((receivedBytes / receivedFileSize) * 100));
        }
        fileTransferProgress.value = progress;
        
        // If we've received all expected chunks, assemble the file
        if (totalChunksToReceive > 0 && 
            Object.keys(receivedChunks).length >= totalChunksToReceive) {
          console.log('Received all chunks, assembling file');
          await assembleAndSaveFile();
        }
      } else {
        console.warn('Received binary data but no chunk sequence was set');
      }
    }
  };
}

// Send acknowledgment for a received chunk
function sendChunkAcknowledgment(sequence) {
  if (!dataChannel || dataChannel.readyState !== 'open') return;
  
  const ack = {
    type: 'chunk-ack',
    transferId: currentTransferId,
    sequence: sequence
  };
  
  try {
    dataChannel.send(JSON.stringify(ack));
  } catch (error) {
    console.error('Error sending chunk acknowledgment:', error);
  }
}

// Start checking for missing chunks periodically
function startMissingChunksCheck() {
  // Clear any existing interval
  clearInterval(missingChunksCheckInterval);
  
  // Check every 5 seconds
  missingChunksCheckInterval = setInterval(() => {
    if (totalChunksToReceive > 0) {
      const missing = findMissingChunks();
      if (missing.length > 0) {
        console.log(`Found ${missing.length} missing chunks, requesting them...`);
        requestMissingChunks(missing);
      }
    }
  }, 5000);
}

// Update received chunks count in metadata
function updateReceivedChunksCount(transferId, count) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(false);
      return;
    }
    
    try {
      const transaction = db.transaction([META_STORE], 'readwrite');
      const store = transaction.objectStore(META_STORE);
      
      const getRequest = store.get(transferId);
      
      getRequest.onsuccess = () => {
        const metadata = getRequest.result;
        if (metadata) {
          metadata.receivedChunks = count;
          metadata.lastUpdated = Date.now();
          store.put(metadata);
          resolve(true);
        } else {
          console.warn(`Cannot update chunks count: Transfer ${transferId} not found`);
          resolve(false);
        }
      };
      
      getRequest.onerror = (e) => {
        console.error('Error getting metadata for update:', e.target.error);
        resolve(false);
      };
    } catch (e) {
      console.error('Exception updating received chunks count:', e);
      resolve(false);
    }
  });
}

// Find missing chunks in the sequence
function findMissingChunks() {
  if (totalChunksToReceive <= 0) return [];
  
  const missing = [];
  for (let i = 0; i < totalChunksToReceive; i++) {
    if (!receivedChunks[i]) {
      missing.push(i);
    }
  }
  
  // Update the received chunks count in metadata
  if (db && currentTransferId) {
    const receivedCount = Object.keys(receivedChunks).length;
    updateReceivedChunksCount(currentTransferId, receivedCount)
      .catch(error => console.error('Failed to update received chunks count:', error));
  }
  
  return missing;
}

// Request missing chunks from the sender
function requestMissingChunks(missingSequences) {
  if (!dataChannel || dataChannel.readyState !== 'open') return;
  
  // Only request up to 10 chunks at a time to avoid flooding
  const toRequest = missingSequences.slice(0, 10);
  
  toRequest.forEach(sequence => {
    const request = {
      type: 'retry-request',
      transferId: currentTransferId,
      sequence: sequence
    };
    
    try {
      dataChannel.send(JSON.stringify(request));
    } catch (error) {
      console.error('Error requesting missing chunk:', error);
    }
  });
  
  // Schedule another request for the remaining chunks if needed
  if (missingSequences.length > 10) {
    setTimeout(() => {
      requestMissingChunks(missingSequences.slice(10));
    }, 1000);
  }
}

// Assemble file from chunks and save it
async function assembleAndSaveFile() {
  console.log('Assembling file from chunks...');
  
  // Clean up any ongoing retry checks
  clearInterval(missingChunksCheckInterval);
  
  try {
    let fileBlob;
    
    // Assemble from IndexedDB if available
    if (db) {
      console.log('Assembling from IndexedDB', currentTransferId);
      console.log('exists?', db);

      const chunks = await getChunks(currentTransferId);
      console.log(`Retrieved ${chunks.length} chunks from IndexedDB`);
      
      if (chunks.length === 0) {
        // Fallback to memory if no chunks in DB
        fileBlob = new Blob(receivedFileChunks, { type: receivedFileType });
      } else {
        // Extract just the data from each chunk object
        const chunkData = chunks.map(chunk => chunk.data);
        fileBlob = new Blob(chunkData, { type: receivedFileType });
      }
    } else {
      // Assemble from memory
      fileBlob = new Blob(receivedFileChunks, { type: receivedFileType });
    }
    
    console.log('File assembled:', receivedFileName, fileBlob.size, 'bytes');
    
    // Create download link
    const fileUrl = URL.createObjectURL(fileBlob);
    const fileItem = document.createElement('li');
    const fileLink = document.createElement('a');
    
    fileLink.href = fileUrl;
    fileLink.textContent = receivedFileName;
    fileLink.download = receivedFileName;
    
    fileItem.appendChild(fileLink);
    fileItem.appendChild(document.createTextNode(` (${formatFileSize(fileBlob.size)})`));
    
    receivedFilesElement.appendChild(fileItem);
    updateStatus(`File received: ${receivedFileName}`);
    
    // Mark transfer as completed instead of deleting it
    if (db) {
      console.log('Marking transfer as completed in IndexedDB', currentTransferId);
      await completeTransfer(currentTransferId);
    }
    
    // Reset file transfer state
    resetReceiveState();
    
  } catch (error) {
    console.error('Error assembling file:', error);
    updateStatus('Error assembling file');
  }
}

// Reset file receive state
function resetReceiveState() {
  receivedFileChunks = [];
  receivedFileName = '';
  receivedFileType = '';
  receivedFileSize = 0;
  receivedBytes = 0;
  receivedChunks = {};
  totalChunksToReceive = 0;
  currentTransferId = '';
  currentChunkSequence = null;
  clearInterval(missingChunksCheckInterval);
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
  
  // Create transfer ID and setup tracking
  currentTransferId = `transfer-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  sentChunks = {};
  
  // Calculate total chunks
  const chunkSize = 16 * 1024; // 16 KB chunks
  const totalChunks = Math.ceil(file.size / chunkSize);
  
  // First, send file metadata
  const metadata = {
    type: 'file-metadata',
    transferId: currentTransferId,
    name: file.name,
    fileType: file.type,
    size: file.size,
    totalChunks: totalChunks,
    chunkSize: chunkSize
  };
  
  console.log('Sending file metadata:', metadata);
  dataChannel.send(JSON.stringify(metadata));
  
  // Flow control settings
  const bufferThreshold = 1024 * 1024; // 1MB buffer threshold
  let offset = 0;
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
      sendNextChunk();
    }
  };
  
  // Start tracking unacknowledged chunks for retry
  startUnacknowledgedChunksTimeout();
  
  // Send a specific chunk by sequence number
  function sendChunk(sequence) {
    const chunkStart = sequence * chunkSize;
    const chunkEnd = Math.min(chunkStart + chunkSize, file.size);
    
    if (chunkStart >= file.size) {
      console.warn(`Invalid chunk sequence ${sequence}, file size is ${file.size}`);
      return;
    }
    
    const reader = new FileReader();
    const slice = file.slice(chunkStart, chunkEnd);
    
    reader.onload = (e) => {
      try {
        // First send metadata about this chunk
        const chunkMetadata = {
          type: 'chunk-metadata',
          transferId: currentTransferId,
          sequence: sequence,
          size: slice.size,
          final: chunkEnd === file.size
        };
        
        dataChannel.send(JSON.stringify(chunkMetadata));
        
        // Then send the actual chunk data
        dataChannel.send(e.target.result);
        
        // Track this chunk as sent but not yet acknowledged
        sentChunks[sequence] = { sent: true, acked: false, timestamp: Date.now() };
        
        // Log progress periodically
        if (sequence % 10 === 0 || chunkEnd === file.size) {
          const totalSent = Object.keys(sentChunks).length;
          console.log(`Sent chunk ${sequence}/${totalChunks} (${chunkEnd}/${file.size} bytes), buffer: ${dataChannel.bufferedAmount}`);
          console.log(`Progress: ${totalSent}/${totalChunks} chunks sent`);
        }
        
        // Update progress
        const progress = Math.min(100, Math.floor((sequence / totalChunks) * 100));
        fileTransferProgress.value = progress;
        
        // If this was the last chunk, notify completion
        if (chunkEnd === file.size) {
          setTimeout(() => {
            notifyTransferComplete();
          }, 1000);
        }
      } catch (error) {
        console.error('Error sending chunk:', error);
        
        // If send queue is full, wait and try again
        if (error.name === 'OperationError' && error.message.includes('send queue is full')) {
          console.log('Send queue full, pausing...');
          sending = false;
        } else {
          // Schedule a retry for this chunk
          setTimeout(() => {
            console.log(`Retrying chunk ${sequence} after error`);
            sendChunk(sequence);
          }, 1000);
        }
      }
    };
    
    reader.onerror = (error) => {
      console.error('Error reading file chunk:', error);
      
      // Retry after a delay
      setTimeout(() => {
        console.log(`Retrying chunk ${sequence} after read error`);
        sendChunk(sequence);
      }, 1000);
    };
    
    reader.readAsArrayBuffer(slice);
  }
  
  // Send the next chunk in sequence
  function sendNextChunk() {
    if (!sending) return;
    
    // If we've reached the end of the file, we're done
    if (offset >= file.size) {
      console.log('All chunks sent initially, waiting for acknowledgments...');
      return;
    }
    
    // Calculate the sequence number for this chunk
    const sequence = Math.floor(offset / chunkSize);
    
    // Send this chunk
    sendChunk(sequence);
    
    // Move to the next chunk
    offset += chunkSize;
    
    // Schedule sending the next chunk
    if (offset < file.size) {
      setTimeout(sendNextChunk, 0);
    }
  }
  
  // Notify receiver that all chunks have been sent
  function notifyTransferComplete() {
    // Only send if all chunks have at least been sent once
    if (Object.keys(sentChunks).length === totalChunks) {
      try {
        const completeMessage = {
          type: 'transfer-complete',
          transferId: currentTransferId,
          totalChunks: totalChunks
        };
        
        dataChannel.send(JSON.stringify(completeMessage));
        console.log('Sent transfer-complete notification');
      } catch (error) {
        console.error('Error sending transfer-complete notification:', error);
      }
    }
  }
  
  // Start checking for unacknowledged chunks and retry them
  function startUnacknowledgedChunksTimeout() {
    // Clear any existing timeout
    clearTimeout(retryTimeoutId);
    
    // Check every 3 seconds
    retryTimeoutId = setTimeout(function checkUnackedChunks() {
      const currentTime = Date.now();
      const unackedChunks = [];
      
      // Find chunks sent more than 5 seconds ago that haven't been acknowledged
      for (const [sequence, status] of Object.entries(sentChunks)) {
        if (status.sent && !status.acked && (currentTime - status.timestamp) > 5000) {
          unackedChunks.push(parseInt(sequence));
        }
      }
      
      // Retry sending these chunks
      if (unackedChunks.length > 0) {
        console.log(`Retrying ${unackedChunks.length} unacknowledged chunks`);
        
        // Only retry a few chunks at once to avoid flooding
        const toRetry = unackedChunks.slice(0, 5);
        toRetry.forEach(sequence => {
          sendChunk(sequence);
        });
      }
      
      // Schedule the next check if we still have chunks that haven't been acknowledged
      if (Object.values(sentChunks).some(status => !status.acked)) {
        retryTimeoutId = setTimeout(checkUnackedChunks, 3000);
      } else if (Object.keys(sentChunks).length === totalChunks) {
        console.log('All chunks acknowledged, transfer complete!');
        updateStatus(`File sent: ${file.name} - All chunks acknowledged`);
      }
    }, 3000);
  }
  
  // Start sending chunks
  sendNextChunk();
}

// Initialize the application
async function init() {
  // Initialize IndexedDB
  try {
    await initDatabase();
    console.log('File storage ready');
  } catch (error) {
    console.error('Error initializing database:', error);
    console.warn('Falling back to in-memory storage');
  }
  
  // Connect to signaling server
  console.log('Initializing WebRTC file transfer application');
  updateStatus('Connecting to server...');
  connectWebSocket();
}

// Event listeners
sendFileBtn.addEventListener('click', sendFile);

// Start the application
init();

// Get all completed transfers
function getCompletedTransfers() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve([]);
      return;
    }
    
    try {
      const transaction = db.transaction([META_STORE], 'readonly');
      const store = transaction.objectStore(META_STORE);
      
      const request = store.getAll();
      
      request.onsuccess = () => {
        const transfers = request.result;
        // Filter out transfers that are not completed
        const completedTransfers = transfers.filter(transfer => transfer.status === 'completed');
        // Sort by completion date, newest first
        completedTransfers.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
        resolve(completedTransfers);
      };
      
      request.onerror = (e) => {
        console.error('Error getting completed transfers:', e.target.error);
        resolve([]);
      };
    } catch (e) {
      console.error('Exception getting completed transfers:', e);
      resolve([]);
    }
  });
}