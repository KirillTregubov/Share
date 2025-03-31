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


export const ClientMessageSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal('rtc_offer'),
        to: UserIDSchema,
        data: z.any()
    }),
    z.object({
        type: z.literal('rtc_answer'),
        to: UserIDSchema,
        data: z.any()
    }),
    z.object({
        type: z.literal('rtc_ice_candidate'),
        to: UserIDSchema,
        data: z.any()
    }),
])
export type ClientMessageType = z.infer<typeof ClientMessageSchema>

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
    ...ClientMessageSchema.options,
])
export type ServerMessageType = z.infer<typeof ServerMessageSchema>
