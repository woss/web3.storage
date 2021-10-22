import { Web3Storage } from 'web3.storage'
import { useQueryClient } from 'react-query'
import { useDropzone } from 'react-dropzone'
import { useRef, useState, useCallback, useContext } from 'react'
import Link from 'next/link'
import pMap from 'p-map'
import prettyBytes from 'pretty-bytes'
import clsx from 'clsx'

import countly from '../lib/countly'
import { getToken, API } from '../lib/api'
import { useProgress as useUploadProgress, STATUS, FilesContext } from '../lib/upload'
import Button from '../components/button'
import Loading from '../components/loading'
import Tooltip from '../components/tooltip'

const MAX_CONCURRENT_UPLOADS = 5

export function getStaticProps() {
  return {
    props: {
      title: "Upload - Web3 Storage",
      redirectTo: "/",
      needsLoggedIn: true,
    },
  }
}

// @ts-ignore
async function delay (operation, timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(operation())
      } catch (error) {
        reject(error)
      }
    }, timeout)
  }) 
}

/**
 * 
 * @param {Object} props
 * @param {import('../lib/upload').FileProgress} props.file
 * @param {String} [props.className]
 * @returns 
 */
function File ({ file, className }) {
  return (
    <div
      className={clsx(
        className,
        "relative mr-2 mb-2 px-2 py-1 border border-w3storage-black text-black leading-normal transition-colors overflow-hidden",
        // @ts-ignore
        file.status !== STATUS.FAILED ? "bg-w3storage-red-light" : "bg-w3storage-red bg-opacity-50"
      )}
    >
      <div
        className={clsx(
          "absolute z-0 top-0 right-full bottom-0 -left-full transition bg-w3storage-green bg-opacity-25"
        )}
        style={{
          transform: `translateX(${file.progress.percentage}%)`
        }}
      />
      <div className="text-sm truncate">{ file.name }</div>
      <div className="text-xs opacity-80">{ prettyBytes(file.size)}</div>
    </div>
  )
}

/**
 * 
 * @param {Object} props
 * @param {import('../lib/upload').UploadProgress} props.progress
 * @returns 
 */
function Files ({ progress }) {
  const fileWrapperClassName = "overflow-hidden"
  const files = Object.values(progress.files)
  
  return <>
    {
      files.map((file) => (
        // @ts-ignore
        file.status === STATUS.FAILED ?
          <Tooltip
            key={file.name}
            placement="top"
            overlay={
              <span>Error: {" "} {progress.files[file.name].error?.message || "Upload failed with unknown error. Please try again."}</span>
            }
          >
            <div className={fileWrapperClassName}>
              <File file={progress.files[file.name]} />
            </div>
          </Tooltip>
        : 
          <File
            key={file.name}
            className={fileWrapperClassName}
            file={progress.files[file.name]}
          />
      ))
    }
    { !progress.ready && 'No file(s) chosen'}
  </>
}

export default function Upload() {
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [finished, setFinished] = useState(false)
  const /** @type {React.MutableRefObject<HTMLInputElement|null>} */ inputRef = useRef(null)
  const { files, set: setFiles } = useContext(FilesContext)
  const {
    progress,
    initialize,
    updateFileProgress,
    markFileCompleted,
    markFileFailed
  } = useUploadProgress(files)

  /** @param {File[]} files */
  const uploadFiles = useCallback(async () => {
    setUploading(true)

    const client = new Web3Storage({
      token: await getToken(),
      endpoint: new URL(API),
    })

    try {      
      const uploadFile = async (/** @type File} */ file) => {
        try {
          if (Math.random() > 0.9) {
            updateFileProgress(file, file.size * 0.1)
            await delay(() => updateFileProgress(file, file.size * 0.3), 1e3)
            await delay(() => updateFileProgress(file, file.size * 0.2), 2e3)
            await delay(() => updateFileProgress(file, file.size * 0.1), 3e3)
            await delay(() => updateFileProgress(file, file.size * 0.3), 4e3)
          } else if (Math.random() > 0.8) {
            updateFileProgress(file, file.size * 0.1)
            await delay(() => updateFileProgress(file, file.size * 0.3), 1e3)
            await delay(() => updateFileProgress(file, file.size * 0.6), 2e3)
            await delay(() => markFileFailed(file, new Error('Payload too large.')), 3e3)
            return
          } else if (Math.random() > 0.7) {
            updateFileProgress(file, file.size * 0.1)
            await delay(() => updateFileProgress(file, file.size * 0.3), 1e3)
            await delay(() => updateFileProgress(file, file.size * 0.6), 2e3)
            await delay(() => markFileFailed(file), 3e3)
            return
          } else {
            await delay(() => updateFileProgress(file, file.size * 0.5), 200)
          }
          // await client.put([file], {
          //   name: file.name,
          //   onStoredChunk: (size) => {
          //     updateFileProgress(file, size)
          //   },
          // })
        } catch (error) {
          markFileFailed(file, error)
          console.error(error)
          return
        }
        
        markFileCompleted(file)
      }

      // @ts-ignore
      await pMap(Object.values(progress.files), uploadFile, { concurrency: MAX_CONCURRENT_UPLOADS })
    } finally {
      await queryClient.invalidateQueries("get-uploads")
      setUploading(false)
      setFinished(true)
      setFiles([])
    }
  }, [
    updateFileProgress, markFileCompleted, markFileFailed, progress.files,
    setFiles,
    queryClient,
  ])

  const onSubmit = useCallback((event) => {
    event.preventDefault()
    
    progress.ready && uploadFiles()
  }, [progress.ready, uploadFiles])

  const openInput = useCallback(() => inputRef?.current?.click(), [])

  const onInputChange = useCallback(() => {
    const fileInput = inputRef?.current

    if(!fileInput || !fileInput.files || !fileInput.files[0]) {
      return
    }

    const files = Array.from(fileInput.files)

    // @ts-ignore
    initialize(files)
    setFiles(files)
    setFinished(false)
  }, [initialize, setFiles])

  /** @param {File[]} acceptedFiles */
  const onDrop = useCallback((acceptedFiles) => {
    if (uploading) {
      return
    }
    
    initialize(acceptedFiles)
    setFiles(acceptedFiles)
    setFinished(false)
  }, [initialize, uploading, setFiles])
  const { getRootProps, isDragActive } = useDropzone({ onDrop, multiple: true })

  return (
    <main className="layout-margins my-4 sm:my-16 text-w3storage-purple h-full flex-grow" {...getRootProps()}>
      <div className="max-w-xl mx-auto">
        <div>
          <div className="flex items-center justify-between">
            <h2>Upload File(s)</h2>
            {
              finished && (
                <Button
                  href="/files"
                  small
                >
                  Go back to files
                </Button>
              )
            }
          </div>
          <form
            onSubmit={onSubmit}
            className='flex flex-col items-start pt-8'
          >
            <div className="mb-8 w-full">
              <label htmlFor="name" className="mb-2 hidden">
                File
              </label>
              <input
                ref={inputRef}
                id="files"
                name="files"
                type="file"
                className="hidden"
                required
                multiple
                onChange={onInputChange}
              />
              <div className="w-full flex p-6 relative">
                <div
                  className={clsx(
                    "absolute z-0 top-0 right-0 bottom-0 left-0 transition border-w3storage-red border-dashed border-2 transform",
                    {
                      "scale-110 border-w3storage-purple bg-w3storage-red": isDragActive && !uploading,
                      "border-w3storage-purple": finished,
                    }
                  )}
                />
                <Button
                    variant="light"
                    wrapperClassName="flex relative z-1 max-h-16"
                    className="leading-5 border-2"
                    onClick={openInput}
                    small={false}
                    disabled={uploading}
                  >
                    Choose File(s)
                </Button>
                <div className="flex relative z-1 flex-wrap items-center px-4 overflow-y-auto max-h-48">
                  <Files progress={progress} />
                </div>
              </div>
            </div>
            <div className="flex w-full">
              <Button
                type="button"
                disabled={uploading || !progress.ready || finished}
                id="upload-file"
                tracking={{
                  event: countly.events.FILE_UPLOAD_CLICK,
                  ui: countly.ui.UPLOAD,
                }}
                onClick={onSubmit}
              >
                {uploading
                  ? <Loading className='user-spinner' fill='white' height={10} />
                  : "Upload"}
              </Button>
              <div className={clsx("ml-8 w-full pt-1", { "hidden": !uploading && !finished })}>
                <div className={clsx(
                  "relative overflow-hidden text-sm border-2 h-6 bg-w3storage-purple bg-opacity-25",
                  finished ? "border-w3storage-purple" : "border-w3storage-blue-desaturated",
                )}>
                  <div className="z-10 relative text-center font-bold h-full text-w3storage-white drop-shadow-lg">
                    {progress.percentage}%
                  </div>
                  <div
                    className={clsx(
                      "absolute z-0 top-0 right-full bottom-0 -left-full transition",
                      finished ? "bg-w3storage-purple" : "bg-w3storage-blue-desaturated",
                    )}
                    style={{ transform: `translateX(${progress.percentage}%)` }}
                  />
                  <div
                    className={clsx(
                      "absolute z-0 top-0 -right-full bottom-0 left-full transition",
                      {
                        "bg-transparent": progress.failed.number === 0,
                        "bg-w3storage-red bg-opacity-75": progress.failed.number > 0 && finished,
                      }
                    )}
                    style={{ transform: `translateX(${progress.percentage - 100}%)` }}
                  />
                </div>
                <div className="flex leading-7 text-sm">
                  <div>
                    {`Files: ${progress.completed.number}/${progress.total.number}`}
                    <span className="text-w3storage-red-dark">{ progress.failed.number ? ` (${progress.failed.number} failed)` : ""}</span>
                  </div>
                  <div className="flex-grow flex justify-end">{`${prettyBytes(progress.completed.size).replace(" ", "")}/${prettyBytes(progress.total.size).replace(" ", "")}`}</div>
                </div>
              </div>
            </div>
            <div>
              <p className="pt-4 text-sm">
                You can also upload files using the{" "}
                <a href="https://www.npmjs.com/package/web3.storage" className="black underline">
                  JS Client Library
                </a>.
              </p>
            </div>
          </form>
        </div>
      </div>
      <div className="mt-16 max-w-xl mx-auto">
        <div className="mb-8">
          <p className="font-semibold">🌍 Public data</p>
          <p className="text-sm leading-6">
            All data uploaded to Web3.Storage is available to anyone who requests it using the correct CID. Do not store any private or sensitive information in an unencrypted form using Web3.Storage.
          </p>
        </div>
        <div>
          <p className="font-semibold">♾️ Permanent data</p>
          <p className="text-sm leading-6">
            Deleting files from the Web3.Storage site’s <Link href="/files"><a className="text-sm font-bold no-underline hover:underline">Files</a></Link> page will remove them from the file listing for your account, but that doesn’t prevent nodes on the <a className="text-sm font-bold no-underline hover:underline" href="https://docs.web3.storage/concepts/decentralized-storage/" target="_blank" rel="noreferrer">decentralized storage network</a> from retaining copies of the data indefinitely. Do not use Web3.Storage for data that may need to be permanently deleted in the future.
          </p>
        </div>
      </div>
    </main>
  )
}
