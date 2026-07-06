/** Structured error for the EKO agent action layer (carries an HTTP status). */
export class AgentActionError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'AgentActionError';
    this.status = status;
  }
}
