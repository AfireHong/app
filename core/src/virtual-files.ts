import { useCallback, useMemo } from 'react'
import type { createStore } from 'jotai'
import { atom, useAtom, useStore } from 'jotai'

import { pipply } from './kits/pipply'

type VFile = {
  path: string
  readonly data?: Record<string, unknown>
  readonly filename: string
  readonly extname: string
  readonly dirname: string
  readonly basename: string
  readonly isLink: boolean
  readonly isDirectory: boolean
  readonly isBuffer?: boolean
} & (
  | {
    readonly isBuffer: true
    readonly contents: Buffer
  }
  | {
    readonly isBuffer?: false
    readonly contents: string
  }
)

export const VFileLinkPath = Symbol('VFileLinkPath')

export interface CreateVFileProps<
  C extends string | Buffer
> {
  path: string, contents?: C, data?: Record<string | symbol, unknown>
}
export const createVFile = <
  C extends string | Buffer,
  IsBuffer extends boolean = C extends Buffer ? true : false
>({ path, contents, data }: CreateVFileProps<C>) => {
  const lastDotIndex = path.lastIndexOf('.')
  return {
    path,
    data,
    contents,
    get basename() {
      return path
        .slice(0, lastDotIndex === -1 ? undefined : lastDotIndex)
        .slice(path.lastIndexOf('/') + 1)
    },
    get filename() {
      return this.basename + this.extname
    },
    get extname() {
      return path.slice(lastDotIndex === -1 ? undefined : lastDotIndex)
    },
    get dirname() { return path.slice(0, path.lastIndexOf('/')) },
    get isLink() {
      return data?.[VFileLinkPath] != null
    },
    get isDirectory() {
      return this.path.endsWith('/')
    },
    get isBuffer() {
      return Buffer.isBuffer(this.contents) as IsBuffer
    }
  }
}

const createSetVFile = (
  setVFiles: (arg0: (vFiles: VFile[]) => VFile[]) => void
) => pipply(createVFile, (rt, index?: number | undefined) => {
  const rtAlias = rt as VFile
  const parents: Iterable<string> = {
    [Symbol.iterator]: function* () {
      let parent = rtAlias.dirname
      while (parent !== '') {
        yield parent
        parent = parent.slice(0, parent.lastIndexOf('/'))
      }
    }
  }
  function autoCreateParent(vFiles: VFile[]) {
    const rtVFiles: VFile[] = []
    for (const parent of parents) {
      if (vFiles.find(vFile => vFile.path === parent)) continue
      rtVFiles.push(createVFile({ path: parent }) as VFile)
    }
    return rtVFiles
  }

  if (index === undefined) {
    setVFiles(vFiles => [...vFiles, ...autoCreateParent(vFiles), rtAlias])
  } else if (index === -1) {
    setVFiles(vFiles => [...autoCreateParent(vFiles), rtAlias, ...vFiles])
  } else {
    setVFiles(vFiles => {
      return [
        ...vFiles.slice(0, index),
        ...autoCreateParent(vFiles),
        rtAlias,
        ...vFiles.slice(index + 1)
      ]
    })
  }
  return rt
})

type CreateSetVFileReturn = ReturnType<typeof createSetVFile>

const setVFileFuncMap = new WeakMap<ReturnType<typeof createStore>, CreateSetVFileReturn>()

export const createSetVFileByStore = (store: ReturnType<typeof createStore>) => {
  if (!setVFileFuncMap.has(store)) {
    setVFileFuncMap
      .set(store, createSetVFile(setVFiles => store.set(vFilesAtom, setVFiles)))
  }
  return setVFileFuncMap.get(store)!
}

export const vFilesAtom = atom<VFile[]>([])

export type UseVFilesReturn = ReturnType<typeof useVFiles>

export const useVFiles = () => {
  const [
    vFiles, setVFiles
  ] = useAtom(vFilesAtom, { store: useStore() })
  const setVFile = useMemo(() => createSetVFile(setVFiles), [setVFiles])
  const removeVFile = useCallback((path: string) => {
    setVFiles(vFiles.filter(vFile => vFile.path !== path))
  }, [vFiles, setVFiles])
  const removeAllVFiles = useCallback(() => {
    setVFiles([])
  }, [setVFiles])
  const getVFile = useCallback((path: string) => {
    return vFiles.find(vFile => vFile.path === path)
  }, [vFiles])

  return [vFiles, setVFiles, useMemo(() => ({
    setVFile,
    removeVFile,
    removeAllVFiles,
    getVFile
  }), [getVFile, removeAllVFiles, removeVFile, setVFile])] as const
}
