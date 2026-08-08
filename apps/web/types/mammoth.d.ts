declare module 'mammoth' {
    interface Message {
        type: 'warning' | 'error'
        message: string
    }

    interface Result {
        value: string
        messages: Message[]
    }

    interface ConvertOptions {
        buffer?: Buffer
        path?: string
    }

    function convertToHtml(options: ConvertOptions): Promise<Result>
    function extractRawText(options: ConvertOptions): Promise<Result>
}
