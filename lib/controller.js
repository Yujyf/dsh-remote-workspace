/**
 * Host remote-workspace Remote owner: target discovery, workspace CRUD, path
 * browsing, and session binding.
 * @module @Yujyf/dsh-remote-workspace
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Context } from '@deepseek-ai/cordis';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { WorkspaceError } from "./errors.js";
import { WorkspaceTargetId } from "./types.js";
/** Host service backing the generated `ctx.remote.remoteWorkspace` namespace. */
let RemoteWorkspaceController = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _listTargets_decorators;
    let _listWorkspaces_decorators;
    let _createWorkspace_decorators;
    let _removeWorkspace_decorators;
    let _connectWorkspace_decorators;
    let _disconnectWorkspace_decorators;
    let _healthCheck_decorators;
    let _listDirectory_decorators;
    let _resolveUri_decorators;
    let _createDirectory_decorators;
    let _bindSession_decorators;
    return class RemoteWorkspaceController extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _listTargets_decorators = [Remote('listTargets')];
            _listWorkspaces_decorators = [Remote('listWorkspaces')];
            _createWorkspace_decorators = [Remote('createWorkspace')];
            _removeWorkspace_decorators = [Remote('removeWorkspace')];
            _connectWorkspace_decorators = [Remote('connectWorkspace')];
            _disconnectWorkspace_decorators = [Remote('disconnectWorkspace')];
            _healthCheck_decorators = [Remote('healthCheck')];
            _listDirectory_decorators = [Remote('listDirectory')];
            _resolveUri_decorators = [Remote('resolveUri')];
            _createDirectory_decorators = [Remote('createDirectory')];
            _bindSession_decorators = [Remote('bindSession')];
            __esDecorate(this, null, _listTargets_decorators, { kind: "method", name: "listTargets", static: false, private: false, access: { has: obj => "listTargets" in obj, get: obj => obj.listTargets }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listWorkspaces_decorators, { kind: "method", name: "listWorkspaces", static: false, private: false, access: { has: obj => "listWorkspaces" in obj, get: obj => obj.listWorkspaces }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createWorkspace_decorators, { kind: "method", name: "createWorkspace", static: false, private: false, access: { has: obj => "createWorkspace" in obj, get: obj => obj.createWorkspace }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _removeWorkspace_decorators, { kind: "method", name: "removeWorkspace", static: false, private: false, access: { has: obj => "removeWorkspace" in obj, get: obj => obj.removeWorkspace }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _connectWorkspace_decorators, { kind: "method", name: "connectWorkspace", static: false, private: false, access: { has: obj => "connectWorkspace" in obj, get: obj => obj.connectWorkspace }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _disconnectWorkspace_decorators, { kind: "method", name: "disconnectWorkspace", static: false, private: false, access: { has: obj => "disconnectWorkspace" in obj, get: obj => obj.disconnectWorkspace }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _healthCheck_decorators, { kind: "method", name: "healthCheck", static: false, private: false, access: { has: obj => "healthCheck" in obj, get: obj => obj.healthCheck }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listDirectory_decorators, { kind: "method", name: "listDirectory", static: false, private: false, access: { has: obj => "listDirectory" in obj, get: obj => obj.listDirectory }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _resolveUri_decorators, { kind: "method", name: "resolveUri", static: false, private: false, access: { has: obj => "resolveUri" in obj, get: obj => obj.resolveUri }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createDirectory_decorators, { kind: "method", name: "createDirectory", static: false, private: false, access: { has: obj => "createDirectory" in obj, get: obj => obj.createDirectory }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _bindSession_decorators, { kind: "method", name: "bindSession", static: false, private: false, access: { has: obj => "bindSession" in obj, get: obj => obj.bindSession }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['typert', 'remoteWorkspace'];
        /** @param ctx - Host context containing the remote-workspace owner. */
        constructor(ctx) {
            super(ctx, 'remoteWorkspaceController', { namespace: 'remoteWorkspace' });
            __runInitializers(this, _instanceExtraInitializers);
        }
        /**
         * List discovered execution targets.
         * @returns the live target catalog.
         */
        async listTargets() {
            return { targets: await this.ctx.remoteWorkspace.listTargets() };
        }
        /**
         * List durable remote workspaces.
         * @returns registered workspaces in display order.
         */
        listWorkspaces() {
            return { workspaces: this.ctx.remoteWorkspace.listWorkspaces() };
        }
        /**
         * Create or reuse a remote workspace for a canonical URI.
         * @param request - URI and optional title.
         * @returns the workspace record.
         */
        async createWorkspace(request) {
            try {
                const workspace = await this.ctx.remoteWorkspace.createWorkspace(request.uri, request.title);
                return { workspace };
            }
            catch (error) {
                throw mapError(error);
            }
        }
        /**
         * Remove a remote workspace registration.
         * @param request - Workspace identity.
         * @returns resolution after deletion.
         */
        async removeWorkspace(request) {
            await this.ctx.remoteWorkspace.removeWorkspace(request.workspaceId);
        }
        /**
         * Connect a workspace, starting a stopped WSL distribution when configured.
         * @param request - Workspace identity.
         * @returns resolution after the helper is ready.
         */
        async connectWorkspace(request) {
            try {
                await this.ctx.remoteWorkspace.connectWorkspace(request.workspaceId);
            }
            catch (error) {
                throw mapError(error, request.workspaceId);
            }
        }
        /**
         * Disconnect a workspace without shutting down its target by default.
         * @param request - Workspace identity.
         * @returns resolution after helpers stop.
         */
        async disconnectWorkspace(request) {
            await this.ctx.remoteWorkspace.disconnectWorkspace(request.workspaceId);
        }
        /**
         * Probe one target.
         * @param request - Target identity.
         * @returns live status.
         */
        async healthCheck(request) {
            return await this.ctx.remoteWorkspace.healthCheck(request.targetId);
        }
        /**
         * List one directory on a target.
         * @param request - Target and optional path.
         * @returns the listing.
         */
        async listDirectory(request) {
            try {
                return await this.ctx.remoteWorkspace.listDirectory(request.targetId, request.path);
            }
            catch (error) {
                throw pathError(error, request.path ?? '');
            }
        }
        /**
         * Build the canonical workspace URI for a native path on a target. Picking
         * surfaces call this instead of assembling a URI scheme themselves.
         * @param request - Target and native path.
         * @returns the canonical URI and its default title.
         */
        resolveUri(request) {
            try {
                return this.ctx.remoteWorkspace.uriForTargetPath(request.targetId, request.path);
            }
            catch (error) {
                throw pathError(error, request.path);
            }
        }
        /**
         * Create a child directory on a target.
         * @param request - Target, parent, and name.
         * @returns the created path as a listing of that directory.
         */
        async createDirectory(request) {
            try {
                const path = await this.ctx.remoteWorkspace.createDirectory(request.targetId, request.parent, request.name);
                return { path };
            }
            catch (error) {
                throw pathError(error, request.parent);
            }
        }
        /**
         * Bind a Session to a remote workspace so later tool calls route there.
         * @param request - Workspace and Session identities.
         * @returns resolution after durability.
         */
        async bindSession(request) {
            try {
                await this.ctx.remoteWorkspace.bindSession(request.sessionId, request.workspaceId);
            }
            catch (error) {
                throw mapError(error, request.workspaceId);
            }
        }
    };
})();
export { RemoteWorkspaceController };
function mapError(error, workspaceId) {
    if (error instanceof WorkspaceError) {
        if (error.code === 'TARGET_NOT_FOUND' || error.code === 'TARGET_OFFLINE' || error.code === 'TARGET_START_FAILED') {
            const targetId = WorkspaceTargetId(error.metadata.distribution !== undefined
                ? `wsl:${error.metadata.distribution}`
                : error.metadata.targetId ?? '');
            return new RemoteError('remote-workspace/target-unavailable', error.message, { targetId }, { cause: error });
        }
        if (workspaceId !== undefined) {
            return new RemoteError('remote-workspace/not-found', error.message, { workspaceId }, { cause: error });
        }
    }
    return new RemoteError('gateway/internal', error instanceof Error ? error.message : String(error), {}, { cause: error });
}
function pathError(error, path) {
    return new RemoteError('remote-workspace/path-failed', error instanceof Error ? error.message : String(error), { path }, { cause: error });
}
export default RemoteWorkspaceController;
//# sourceMappingURL=controller.js.map