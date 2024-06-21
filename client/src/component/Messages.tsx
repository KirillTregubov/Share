interface MessageProps {
    message:string
}

// animate-fadeOut

export default function Messages ({message}:MessageProps){
    return(
        <div className=" relateive h-32 w-32 bg-blue-400"> {message} </div>
    )
}