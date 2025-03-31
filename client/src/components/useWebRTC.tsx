import { socketQuery } from '@/lib/queries'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

export function useWebRTC(peerId: string) {
  const { data: socket } = useSuspenseQuery(socketQuery)
  const [pc, setPc] = useState<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)

  useEffect(() => {
    if (!socket) return

    // Create the RTCPeerConnection when the hook is used.
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })
    setPc(connection)

    // Handle ICE candidate events.
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(
          JSON.stringify({
            type: 'signal-ice',
            to: peerId,
            ice: event.candidate
          })
        )
      }
    }

    // Optionally, listen for incoming data channels.
    connection.ondatachannel = (event) => {
      dataChannelRef.current = event.channel
      event.channel.onopen = () => console.log('Data channel opened')
      event.channel.onmessage = (e) => console.log('Data received:', e.data)
    }

    // Create a data channel if initiating connection.
    // console.log('Create data channel')
    // if () {
    //   const channel = connection.createDataChannel('fileTransfer');
    //   channel.onopen = () => console.log('Data channel opened');
    //   channel.onmessage = (e) => console.log('Data received:', e.data);
    //   dataChannelRef.current = channel;
    // }

    // Cleanup when unmounting.
    return () => {
      connection.close()
    }
  }, [peerId, socket])

  const createOffer = useCallback(async () => {
    if (!socket) return

    if (!pc) return
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.send(
        JSON.stringify({
          type: 'signal-sdp',
          to: peerId,
          sdp: pc.localDescription
        })
      )

      console.log('connectionState:', pc.connectionState)
      console.log('signalingState:', pc.signalingState)
    } catch (error) {
      console.error('Error creating offer:', error)
    }
  }, [pc, peerId, socket])

  const createAnswer = useCallback(
    async (offer: RTCSessionDescriptionInit) => {
      if (!socket) return
      if (!pc) return
      try {
        await pc.setRemoteDescription(offer)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.send(
          JSON.stringify({
            type: 'signal-sdp',
            to: peerId,
            sdp: pc.localDescription
          })
        )
      } catch (error) {
        console.error('Error creating answer:', error)
      }
    },
    [pc, peerId, socket]
  )

  return {
    pc,
    dataChannel: dataChannelRef.current,
    createOffer,
    createAnswer
  }
}
