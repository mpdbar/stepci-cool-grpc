import * as grpc from '@grpc/grpc-js'
import * as protobuf from 'protobufjs'
import { PeerCertificate } from 'tls'

type ClientConfig = {
  url: string
  service: string
  method: string
  data: object
  options?: ClientConfigOptions
}

type ClientConfigOptions = {
  tls?: {
    rootCerts?: Buffer
    privateKey?: Buffer
    certChain?: Buffer
    verifyOptions?: VerifyOptions
  }
}

type VerifyOptions = {
  checkServerIdentity?: CheckServerIdentityCallback
}

type CheckServerIdentityCallback = (
  hostname: string,
  cert: PeerCertificate
) => Error | undefined

type LookupResult = {
  requestType: string
  responseType: string
}

export async function makeRequest (proto: string, { url, service, method, data, options = {} }: ClientConfig): Promise<object> {
  return new Promise(async (resolve, reject) => {
    const root = await protobuf.load(proto)
    const [packageName, serviceName] = service.split('.')

    const { requestType, responseType } = root.lookup(`${packageName}.${method}`) as unknown as LookupResult
    const requestMessageType = root.lookupType(requestType)
    const responseMessageType = root.lookupType(responseType)

    const verifyError = requestMessageType.verify(data)
    if (verifyError) return reject(Error(verifyError))

    const message = requestMessageType.create(data)
    const messageEncoded = requestMessageType.encode(message).finish()

    let credentials
    if (!options.tls) {
      credentials = grpc.credentials.createInsecure()
    } else {
      credentials = grpc.credentials.createSsl(options.tls.rootCerts, options.tls.privateKey, options.tls.certChain, options.tls.verifyOptions)
    }

    const client = new grpc.Client(url, credentials)
    client.makeUnaryRequest(`/${packageName}.${serviceName}/${method}`, x => x, x => x, Buffer.from(messageEncoded), (error, message) => {
      if (error) return reject(error)
      if (message) return resolve(responseMessageType.decode(message).toJSON())
    })
  })
}