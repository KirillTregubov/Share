import { queryClient } from '@/main'
import { ServerMessageSchema, type ClientMessageType } from 'schemas'
import {
  dangerouslySetUser,
  peersQuery,
  socketQuery,
  userLoaded,
  userQuery
} from './queries'
import type { ClientUserType } from './schemas'

const WS_URL = import.meta.env.VITE_WS_URL

// NOTE: WebSocket connection singleton
let socket = null as WebSocket | null

function assertUnreachable(x: never): never {
  console.error('Reached unreachable code', x)
  throw new Error('Reached unreachable code')
}

export async function connect() {
  if (!socket) {
    console.log('Creating WebSocket connection...')
    socket = new WebSocket(WS_URL)

    socket.onopen = () => {
      console.log('WebSocket connected')
    }
    socket.onmessage = (event) => {
      // console.log(event)
      // console.log('Received:', event.data)

      if (typeof event.data !== 'string') {
        console.error('Received non-string message', event.data)
        return
      }

      const result = ServerMessageSchema.safeParse(JSON.parse(event.data))
      if (result.error) {
        console.error(
          'Invalid message received',
          event.data,
          'with error:',
          result.error
        )
        return
      }

      const message = result.data
      switch (message.type) {
        case 'client_self': {
          console.log('Connected as user', message.data)
          const user = message.data
          dangerouslySetUser(user)
          queryClient.setQueryData(peersQuery.queryKey, (peers) => {
            if (!peers) return peers
            const newPeers = new Map(peers)
            newPeers.delete(user.id)
            return newPeers
          })
          break
        }
        case 'client_connect': {
          const user = queryClient.getQueryData(userQuery.queryKey)
          if (user && user.id === message.data.id) break

          const peers = queryClient.getQueryData(peersQuery.queryKey)
          if (peers?.has(message.data.id)) break

          console.log('Discovered peer', message)
          const peer = message.data as ClientUserType

          // peer._connection = new RTCPeerConnection({
          //   // peerIdentity: peer.id,
          //   iceServers: [
          //     {
          //       urls: 'stun:stun.l.google.com:19302'
          //     }
          //   ]
          // })
          // peer._connection.onicecandidate = (e) => {
          //   if (!e.candidate) return

          //   console.log('ICE send signal', e.candidate)
          //   //   const signal = {
          //   //     type: 'signal-ice',
          //   //     to: peer.id,
          //   //     ice: e.candidate
          //   //   } satisfies ClientMessageType
          //   //   socket!.send(JSON.stringify(signal))
          // }
          // peer._connection.onconnectionstatechange = (e) => {
          //   if (!peer._connection) return
          //   console.log(
          //     'RTC: state changed:',
          //     peer._connection!.connectionState
          //   )
          //   //   switch (peer._connection.connectionState) {
          //   //     case 'disconnected':
          //   //       peer._connection.close()
          //   //       // this._onChannelClosed();

          //   //       // TODO: retry connection
          //   //       break
          //   //     case 'failed':
          //   //       peer._connection.close()
          //   //       // this._conn = null;
          //   //       // this._onChannelClosed();
          //   //       break
          //   //   }
          //   // }
          //   // peer._connection.oniceconnectionstatechange = (e) => {
          //   //   console.log(
          //   //     'ICE state changed:',
          //   //     peer._connection!.iceConnectionState
          //   //   )
          //   //   //   switch (this._conn.iceConnectionState) {
          //   //   //     case 'failed':
          //   //   //         console.error('ICE Gathering failed');
          //   //   //         break;
          //   //   //     default:
          //   //   //         console.log('ICE Gathering', this._conn.iceConnectionState);
          //   //   // }
          // }

          // console.log('CREATE DATA CHANNEL - CREATE OFFER')
          // const channel = peer._connection.createDataChannel('data-channel', {
          //   ordered: true
          //   // reliable: true // Obsolete. See https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/reliable
          // })
          // channel.onopen = (e) => {
          //   console.log('Data channel opened', e)
          // }
          // peer._connection
          //   .createOffer()
          //   .then((d) => {
          //     if (!peer._connection) return
          //     peer._connection
          //       .setLocalDescription(d)
          //       .then((_) => {
          //         console.log('send initial signal', d)

          //         const signal = {
          //           type: 'signal-sdp',
          //           to: peer.id,
          //           sdp: d
          //         } satisfies ClientMessageType
          //         socket!.send(JSON.stringify(signal))
          //       })
          //       .catch((e) => {
          //         console.error('Failed to set local description', e)
          //       })
          //   })
          //   .catch((e) => {
          //     throw new Error('Failed to create offer', e as Error)
          //   })
          // // peer._connection = connection
          // console.log('Created connection', peer._connection)

          queryClient.setQueryData(peersQuery.queryKey, (peers) => {
            if (!peers) peers = new Map()
            return new Map(peers).set(peer.id, peer)
          })

          break
        }
        case 'client_disconnect':
          console.log('Disconnected peer', message.data)
          queryClient.setQueryData(peersQuery.queryKey, (peers) => {
            if (!peers) return peers
            const newPeers = new Map(peers)
            newPeers.delete(message.data.id)
            return newPeers
          })
          break
        case 'message':
          console.log('Received message', message.data)
          break
        case 'signal-sdp':
          if (!message.sender) break
          console.log('Received signal sdp', message.sender)

          const peers = queryClient.getQueryData(peersQuery.queryKey)
          const peer = peers?.get(message.sender)
          if (!peer) break

          if (!peer._connection) {
            // TODO: make connection if it doesn't exist?
            console.error(
              'NO PEER CONNECTION YET. received signal sdp',
              message
            )

            // console.log('Creating peer connection')
            // peer._connection = new RTCPeerConnection({
            //   // peerIdentity: peer.id,
            //   iceServers: [
            //     {
            //       urls: 'stun:stun.l.google.com:19302'
            //     }
            //   ]
            // })
            // peer._connection.onicecandidate = (e) => {
            //   if (!e.candidate) return

            //   console.log('ICE send signal', e.candidate)
            //   //   const signal = {
            //   //     type: 'signal-ice',
            //   //     to: peer.id,
            //   //     ice: e.candidate
            //   //   } satisfies ClientMessageType
            //   //   socket!.send(JSON.stringify(signal))
            // }
            // peer._connection.onconnectionstatechange = (e) => {
            //   if (!peer._connection) return
            //   console.log(
            //     'RTC: state changed:',
            //     peer._connection!.connectionState
            //   )
            //   //   switch (peer._connection.connectionState) {
            //   //     case 'disconnected':
            //   //       peer._connection.close()
            //   //       // this._onChannelClosed();

            //   //       // TODO: retry connection
            //   //       break
            //   //     case 'failed':
            //   //       peer._connection.close()
            //   //       // this._conn = null;
            //   //       // this._onChannelClosed();
            //   //       break
            //   //   }
            //   // }
            //   // peer._connection.oniceconnectionstatechange = (e) => {
            //   //   console.log(
            //   //     'ICE state changed:',
            //   //     peer._connection!.iceConnectionState
            //   //   )
            //   //   //   switch (this._conn.iceConnectionState) {
            //   //   //     case 'failed':
            //   //   //         console.error('ICE Gathering failed');
            //   //   //         break;
            //   //   //     default:
            //   //   //         console.log('ICE Gathering', this._conn.iceConnectionState);
            //   //   // }
            // }

            break
          }

          // console.log('State', peer._connection.connectionState)
          console.log('Type', message.sdp.type)

          if (message.sdp.type === 'offer') {
            peer._connection
              .setRemoteDescription(new RTCSessionDescription(message.sdp))
              .then(() => {
                if (!peer._connection) return
                if (message.sdp.type !== 'offer') return

                console.log('State', peer._connection.connectionState)

                peer._connection.createAnswer().then((d) => {
                  if (!peer._connection) return

                  peer._connection
                    .setLocalDescription(d)
                    .then(() => {
                      console.log('send answer signal', d)

                      const signal = {
                        type: 'signal-sdp',
                        to: peer.id,
                        sdp: d
                      } satisfies ClientMessageType
                      socket!.send(JSON.stringify(signal))
                      console.log('sent')
                    })
                    .catch((e) => {
                      console.error('Failed to set local description', e)
                    })
                })
              })
              .catch((e) => {
                console.error(e)
              })
          } else if (message.sdp.type === 'answer') {
            peer._connection
              .setRemoteDescription(new RTCSessionDescription(message.sdp))
              .then(() => {
                if (!peer._connection) {
                  console.error('no peerconnection')
                  return
                }
                console.log('State', peer._connection.connectionState)
              })
              .catch((e) => {
                console.error(e)
                throw new Error('Failed to set remote description')
              })
          }
          break
        case 'signal-ice': {
          if (!message.sender) break
          console.log('Received signal ice', message.sender)

          const peers = queryClient.getQueryData(peersQuery.queryKey)
          const peer = peers?.get(message.sender)
          if (!peer) break

          if (!peer._connection) {
            // TODO: make connection if it doesn't exist?
            console.error('No connection for received signal sdp', message)
            // maybe addIceCandidate(null) ?
            break
          }

          peer._connection.addIceCandidate(new RTCIceCandidate(message.ice))
          break
        }
        default:
          return assertUnreachable(message)
      }
    }
    socket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
    socket.onclose = (event) => {
      if (event.code === 4000) return //
      queryClient.setQueryData(socketQuery.queryKey, null)
      socket = null
    }
    window.addEventListener('beforeunload', () => {
      socket?.close(4000) // from https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4.2
    })

    // Wait for the connection to be established
    await Promise.allSettled([
      new Promise<void>((resolve, reject) => {
        function onOpen() {
          console.log('WebSocket connected')
          cleanUp()
          resolve()
        }
        function onError(error: Event) {
          console.error('WebSocket error:', error)
          cleanUp()
          reject(
            new Error('WebSocket connection failed! Is the server running?')
          )
        }
        function cleanUp() {
          socket!.removeEventListener('open', onOpen)
          socket!.removeEventListener('error', onError)
        }

        socket!.addEventListener('open', onOpen)
        socket!.addEventListener('error', onError)
      }),
      userLoaded
    ])
  }
  return socket as WebSocket | null
}
