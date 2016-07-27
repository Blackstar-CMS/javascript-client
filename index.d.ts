declare module 'blackstar-cms-client' {
    export interface Options {
        showEditControls: boolean,
        token: string,
        authCallback: (response:any) => void
    }

    export class Client {
        constructor(url:string, options?:Options)
        create(chunk:any)
        update(chunk:any)
        getAllTags()
        get(query:any)
        getAll()
        bind(any)
        delete(id:number)
        adminSearch(query:string)
        mediaSearch(query:string)
        createMedia(media:any)
        deleteMedia(hash:string)
    }
}
