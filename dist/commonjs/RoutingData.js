"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class RoutingData {
    constructor(router_list, url_list, method, passing) {
        this.prev_routers = [];
        this.prev_urls = [];
        this.method = null;
        this.passing = null;
        this.params = {};
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
    getRouter() {
        return this.prev_routers[this.prev_routers.length - 1];
    }
    getURL() {
        return this.prev_urls[this.prev_urls.length - 1];
    }
    async redirect(path, method) {
        if (method == null) {
            method = this.method;
        }
        return this.prev_routers[0].run(path, method, ...this.passing);
    }
    async redirectWith(path, method, ...passing) {
        if (method == null) {
            method = this.method;
        }
        return this.prev_routers[0].run(path, method, ...passing);
    }
}
exports.default = RoutingData;
//# sourceMappingURL=RoutingData.js.map