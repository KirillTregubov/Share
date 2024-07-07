import Avatar from 'boring-avatars'
import type { User } from 'schemas'
import colors from 'tailwindcss/colors'

export default function Peer({ peer }: { peer: User }) {
  return (
    <div className="flex w-fit flex-col items-center justify-center gap-1.5 p-4">
      <div className="size-20">
        <Avatar
          size="100%"
          name={peer.id}
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
        <h2 className="font-medium">{peer.name}</h2>
        <h3 className="font-light text-neutral-800">{peer.device}</h3>
        <h3 className="font-light text-neutral-800">{peer.network}</h3>
      </div>
    </div>
  )
}
