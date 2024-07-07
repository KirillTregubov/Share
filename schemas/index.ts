import { z } from "zod";

export const UserSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    device: z.string(),
    network: z.string(), // for debugging
})
export type UserType = z.infer<typeof UserSchema>

export const MessageSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal('client_self'),
        data: UserSchema,
    }),
    z.object({
        type: z.literal('client_connect'),
        data: UserSchema,
    }),
    z.object({
        type: z.literal('client_disconnect'),
        data: UserSchema,
    }),
    z.object({
        type: z.literal('message'),
        data: z.string(),
    }),
])
export type MessageType = z.infer<typeof MessageSchema>