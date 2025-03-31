import { socketQuery } from '@/lib/queries'
import type { ClientUserType } from '@/lib/schemas'
import { useSuspenseQuery } from '@tanstack/react-query'
import Avatar from 'boring-avatars'
import clsx from 'clsx'
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import colors from 'tailwindcss/colors'

export const User = forwardRef<
  HTMLDivElement,
  {
    user: ClientUserType
    children?: ReactNode
    className?: string
  }
>(function User({ user, children, className }, ref) {
  return (
    <div
      ref={ref}
      className={clsx(
        'relative flex w-fit flex-col items-center justify-center gap-1.5 rounded-md p-4',
        className
      )}
    >
      <div className="size-20">
        <Avatar
          size="100%"
          name={user.id}
          variant="beam"
          colors={[
            colors.lime[500],
            colors.sky[600],
            colors.amber[500],
            colors.rose[500]
          ]}
        />
      </div>
      <div className="flex flex-col items-center">
        <h2 className="font-medium">{user.name}</h2>
        <h3 className="font-light text-neutral-800">{user.device}</h3>
        <h3 className="font-light text-neutral-800">{user.network}</h3>
        <h3 className="font-light text-neutral-800">{user.id}</h3>
      </div>
      {children}
    </div>
  )
})

let numDraggedItems = 0

export function Peer({ peer }: { peer: ClientUserType }) {
  const { data: socket } = useSuspenseQuery(socketQuery)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [peerConnection, setPeerConnection] =
    useState<RTCPeerConnection | null>(null)
  const [transferProgress, setTransferProgress] = useState<number>(0)
  const [transferStatus, setTransferStatus] = useState<string>('')

  const [dragging, setDragging] = useState(false)
  const handleSubmit = useCallback(
    (file: File) => {
      setTransferStatus('Connecting...')

      console.log('Sending message:', file)
      //
      // socket!.send(JSON.stringify(signal))

      // Create peer connection if it doesn't exist
      const pc =
        peerConnection ||
        new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        })

      if (!peerConnection) {
        setPeerConnection(pc)
        console.log('Set peer connection')

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            // Send candidate to peer via signaling server
            const message = {
              type: 'signal-ice',
              to: peer.id,
              ice: event.candidate
            }

            console.log('Send ICE candidate:', message)
            // Send via WebSocket
            // const socket = new WebSocket(`${import.meta.env.VITE_WS_URL}webrtc`)
            // socket.onopen = () => socket.send(JSON.stringify(message))
          }
        }
      }

      // // Create data channel
      // const dataChannel = pc.createDataChannel('fileTransfer')
      // dataChannel.binaryType = 'arraybuffer'

      // // Set up data channel events
      // dataChannel.onopen = () => {
      //   setTransferStatus('Connection established. Sending file...')
      //   sendFile(file, dataChannel)
      // }

      // dataChannel.onerror = (error) => {
      //   console.error('Data channel error:', error)
      //   setTransferStatus('Error: Data channel failed')
      // }

      // // Create and send offer
      // pc.createOffer()
      //   .then((offer) => pc.setLocalDescription(offer))
      //   .then(() => {
      //     // Send offer to peer via signaling server
      //     const message = {
      //       type: 'signal-sdp',
      //       to: peer.id,
      //       sdp: pc.localDescription
      //     }
      //     // Send via WebSocket
      //     // const socket = new WebSocket(`${import.meta.env.VITE_WS_URL}webrtc`)
      //     // socket.onopen = () => socket.send(JSON.stringify(message))
      //   })
      //   .catch((error) => {
      //     console.error('Error creating offer:', error)
      //     setTransferStatus('Error: Connection failed')
      //   })
    },
    [peer.id, peerConnection]
  )

  // Function to send file in chunks
  // const sendFile = (file: File, channel: RTCDataChannel) => {
  //   // First send metadata
  //   const metadata = {
  //     name: file.name,
  //     type: file.type,
  //     size: file.size
  //   }
  //   channel.send(JSON.stringify(metadata))

  //   // Then send the file in chunks
  //   const chunkSize = 16384 // 16KB chunks
  //   const fileReader = new FileReader()
  //   let offset = 0

  //   fileReader.onload = (e) => {
  //     if (e.target?.result && channel.readyState === 'open') {
  //       channel.send(e.target.result as ArrayBuffer)
  //       offset += (e.target.result as ArrayBuffer).byteLength

  //       // Update progress
  //       const progress = Math.min(100, Math.round((offset / file.size) * 100))
  //       setTransferProgress(progress)
  //       setTransferStatus(`Sending: ${progress}%`)

  //       // Continue sending if there's more data
  //       if (offset < file.size) {
  //         readSlice(offset)
  //       } else {
  //         setTransferStatus('File sent successfully!')
  //       }
  //     }
  //   }

  //   fileReader.onerror = () => {
  //     setTransferStatus('Error reading file')
  //   }

  //   const readSlice = (o: number) => {
  //     const slice = file.slice(o, o + chunkSize)
  //     fileReader.readAsArrayBuffer(slice)
  //   }

  //   readSlice(0)
  // }

  // Setup WebRTC answer handling
  // useEffect(() => {
  //   // const socket = new WebSocket(`${import.meta.env.VITE_WS_URL}webrtc`)

  //   socket.onmessage = async (event) => {
  //     try {
  //       const message = JSON.parse(event.data)

  //       if (message.sender === peer.id) {
  //         if (message.type === 'signal-sdp' && message.sdp.type === 'answer') {
  //           // Set remote description from answer
  //           if (peerConnection) {
  //             await peerConnection.setRemoteDescription(
  //               new RTCSessionDescription(message.sdp)
  //             )
  //           }
  //         } else if (message.type === 'signal-ice' && message.ice) {
  //           // Add ICE candidate
  //           if (peerConnection) {
  //             await peerConnection.addIceCandidate(
  //               new RTCIceCandidate(message.ice)
  //             )
  //           }
  //         }
  //       }
  //     } catch (error) {
  //       console.error('Error handling signaling message:', error)
  //     }
  //   }

  //   return () => {
  //     socket.close()
  //   }
  // }, [peer.id, peerConnection])

  const handleClick = useCallback(() => {
    if (!inputRef.current) return
    inputRef.current.click()
  }, [inputRef])
  const handleDragIn = useCallback((ev: DragEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
    numDraggedItems++
    if (ev.dataTransfer?.items?.length !== 0) {
      setDragging(true)
    }
  }, [])
  const handleDragOut = useCallback((ev: DragEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
    numDraggedItems--
    if (numDraggedItems > 0) return
    setDragging(false)
  }, [])
  const handleDrag = useCallback((ev: DragEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
  }, [])
  const handleCancel = useCallback((ev: Event) => {
    setDragging(false)
    numDraggedItems = 0

    if (!(ev.target instanceof HTMLInputElement)) return
    if (ev.target.files && ev.target.files.length === 0) {
      console.log('No files selected')
    }
  }, [])
  const handleDrop = useCallback(
    (ev: DragEvent) => {
      ev.preventDefault()
      ev.stopPropagation()

      setDragging(false)
      numDraggedItems = 0

      const eventFiles = ev.dataTransfer?.files
      if (eventFiles && eventFiles.length > 0) {
        const files = eventFiles[0]! // multiple ? eventFiles : eventFiles[0]
        handleSubmit(files)
      }
    },
    [handleSubmit]
  )

  useEffect(() => {
    const element = ref.current
    if (!element) return

    element.addEventListener('click', handleClick)
    element.addEventListener('dragenter', handleDragIn)
    element.addEventListener('dragleave', handleDragOut)
    element.addEventListener('dragover', handleDrag)
    element.addEventListener('drop', handleDrop)

    return () => {
      element.removeEventListener('click', handleClick)
      element.removeEventListener('dragenter', handleDragIn)
      element.removeEventListener('dragleave', handleDragOut)
      element.removeEventListener('dragover', handleDrag)
      element.removeEventListener('drop', handleDrop)
    }
  }, [handleClick, handleDrag, handleDragIn, handleDragOut, handleDrop, ref])

  useEffect(() => {
    const element = inputRef.current
    if (!element) return

    element.addEventListener('cancel', handleCancel)

    return () => {
      element.removeEventListener('cancel', handleCancel)
    }
  }, [handleCancel, inputRef])

  return (
    <User user={peer} ref={ref}>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleSubmit(e.target.files[0]!)
          } else {
            console.log('No files selected')
          }
        }}
      />
      {transferStatus && (
        <div className="mt-2 w-full">
          <div className="text-center text-sm">{transferStatus}</div>
          {transferProgress > 0 && (
            <div className="mt-1 h-2.5 w-full rounded-full bg-gray-200">
              <div
                className="h-2.5 rounded-full bg-blue-600"
                style={{ width: `${transferProgress}%` }}
              ></div>
            </div>
          )}
        </div>
      )}
      {dragging && (
        <div className="absolute top-0 left-0 flex h-full w-full items-center justify-center bg-neutral-100/80">
          <div className="flex flex-col items-center justify-center">
            <h2 className="font-medium">Drop file here</h2>
          </div>
        </div>
      )}
    </User>
  )
}
