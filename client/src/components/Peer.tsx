import type { ClientUserType } from '@/lib/schemas'
import { useRef } from 'react'
import { User } from './User' // your presentational component
import { useWebRTC } from './useWebRTC' // path to your custom hook

export function Peer({ peer }: { peer: ClientUserType }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { dataChannel, createOffer } = useWebRTC(peer.id)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Trigger offer creation and file transfer logic here.
      console.log('Sending offer for file', file)
      createOffer()
      // Once the connection is established, use dataChannel to send file chunks.
      // sendFile(file, dataChannel);
    }
  }

  return (
    <User user={peer}>
      <input ref={inputRef} type="file" hidden onChange={handleFileSelect} />
      <div
        onClick={() => {
          if (!inputRef.current) {
            console.error('No input element found')
            return
          }
          inputRef.current.click()
        }}
      >
        Click or drag file here to send
      </div>
    </User>
  )
}
