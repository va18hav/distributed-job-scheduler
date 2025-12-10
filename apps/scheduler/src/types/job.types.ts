export interface CreateJob {
    type: string;
    payload: any;
    priority?: number;
    availableAt?: Date;
}
