interface MessageProps {
    message: string
}

// animate-fadeOut

export default function Messages({ message }: MessageProps) {
    return (
        <div className="absolute bottom-0 inset-x-0 text-center rounded-full mx-72 my-4 bg-blue-400">
            {message}
        </div>
    )
}