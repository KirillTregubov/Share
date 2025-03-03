import { z } from "zod";

const UserIDSchema = z.string().uuid()
export type UserIDType = z.infer<typeof UserIDSchema>

export const UserSchema = z.object({
    id: UserIDSchema,
    name: z.string(),
    device: z.string(),
    network: z.string(), // for debugging
})
export type UserType = z.infer<typeof UserSchema>

export const ServerMessageSchema = z.discriminatedUnion("type", [
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
    z.object({
        type: z.literal('signal-ice'),
        sender: UserIDSchema,
        ice: z.any()
    }),
    z.object({
        type: z.literal('signal-sdp'),
        sender: UserIDSchema,
        sdp: z.any()
    }),
])
export type ServerMessageType = z.infer<typeof ServerMessageSchema>

export const ClientMessageSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal('signal-ice'),
        to: UserIDSchema,
        ice: z.any()
    }),
    z.object({
        type: z.literal('signal-sdp'),
        to: UserIDSchema,
        sdp: z.any()
    }),
])
export type ClientMessageType = z.infer<typeof ClientMessageSchema>
