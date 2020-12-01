export default class RouterError extends Error {

    constructor(message: string) {
        super(message);

        this.name = "RouterError";
        
        Error.captureStackTrace(this, RouterError);
    }

}