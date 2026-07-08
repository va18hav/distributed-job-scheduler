import { InputJsonValue } from "@prisma/client/runtime/client"

export interface CreateJob {
    type: string
    payload: InputJsonValue
}