import Router from "./Router";
import { URL } from "url";

interface ParamsObject {
    [key: string]: string
}

class RoutingData<T extends any[]> {

    readonly prev_routers: Router<T>[] = [];
    readonly prev_urls: URL[] = [];
    readonly method: string = null;
    readonly passing: T = null;

    public params: ParamsObject = {};

    constructor(router_list: Router<T>[], url_list: URL[], method: string, passing: T) {
        this.prev_routers = router_list;
        this.prev_urls = url_list;
        this.method = method;
        this.passing = passing;
    }

    get router() {
        return this.prev_routers[this.prev_routers.length - 1];
    }

    get url() {
        return this.prev_urls[this.prev_urls.length - 1];
    }

    public getRouter() {
        return this.prev_routers[this.prev_routers.length - 1];
    }

    public getURL() {
        return this.prev_urls[this.prev_urls.length - 1];
    }

    public async redirect(path: string | URL, method?: string) {
        if (method == null) {
            method = this.method;
        }

        return this.prev_routers[0].run(path, method, ...this.passing);
    }

    public async redirectWith(path: string | URL, method?: string, ...passing: T) {
        if (method == null) {
            method = this.method;
        }

        return this.prev_routers[0].run(path, method, ...passing);
    }
}

export default RoutingData;