import { UserSchema } from 'schemas'
import { z } from 'zod'

export const ClientUserSchema = UserSchema.extend({
  _connection: z.instanceof(RTCPeerConnection).optional()
})
export type ClientUserType = z.infer<typeof ClientUserSchema>
