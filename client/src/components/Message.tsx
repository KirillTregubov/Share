interface MessageProps {
  message: string
}

// animate-fadeOut

export default function Messages({ message }: MessageProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 mx-72 my-4 rounded-full bg-blue-400 text-center">
      {message}
    </div>
  )
}
