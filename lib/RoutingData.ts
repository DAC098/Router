import Router from "./Router";
import { URL } from "url";

interface ParamsObject {
    [key: string]: string
}

class RoutingData<T extends any[]> {

    readonly prev_routers: Router<T>[] = [];
    readonly prev_urls: URL[] = [];

    public params: ParamsObject = {};

    constructor(router_list: Router<T>[], url_list: URL[]) {
        this.prev_routers = router_list;
        this.prev_urls = url_list;
    }

    public getRouter() {
        return this.prev_routers[this.prev_routers.length - 1];
    }

    public getURL() {
        return this.prev_urls[this.prev_urls.length - 1];
    }
}

export default RoutingData;