interface MessageProps {
    message:string
}

// animate-fadeOut

export default function Messages ({message}:MessageProps){
    return(
        <div className="relative h-32 w-32">
            <div className="absolute inset-x-0 bottom-0 h-32 w-32 bg-blue-400"> 
                {message} 
            </div>
        </div>
    )
}