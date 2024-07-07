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
import type { UserType } from 'schemas'
import colors from 'tailwindcss/colors'

export const User = forwardRef<
  HTMLDivElement,
  {
    user: UserType
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
      </div>
      {children}
    </div>
  )
})

let numDraggedItems = 0

export function Peer({ peer }: { peer: UserType }) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [dragging, setDragging] = useState(false)
  const handleSubmit = useCallback((file: File) => {
    console.log(file)
  }, [])

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
      {dragging && (
        <div className="absolute left-0 top-0 flex h-full w-full items-center justify-center bg-neutral-100/80">
          <div className="flex flex-col items-center justify-center">
            <h2 className="font-medium">Drop file here</h2>
          </div>
        </div>
      )}
    </User>
  )
}
