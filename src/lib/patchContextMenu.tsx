/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModuleByExport,
  Export,
  MenuItem,
  Navigation,
  Patch
} from '@decky/ui'
import { FC } from 'react'
import useTranslations from '../hooks/useTranslations'

function ChangeMusicButton({ appId }: { appId: number }) {
  const t = useTranslations()
  return (
    <MenuItem
      key="game-theme-music-change-music"
      onSelected={() => {
        Navigation.Navigate(`/gamethememusic/${appId}`)
      }}
    >
      {t('changeThemeMusic')}...
    </MenuItem>
  )
}

// Always add before "Properties..."
const spliceChangeMusic = (children: any[], appid: number) => {
  children.find((x: any) => x?.key === 'properties')
  const propertiesMenuItemIdx = children.findIndex((item) =>
    findInReactTree(
      item,
      (x) => x?.onSelected && x.onSelected.toString().includes('AppProperties')
    )
  )
  children.splice(
    propertiesMenuItemIdx,
    0,
    <ChangeMusicButton key="game-theme-music-change-music" appId={appid} />
  )
}

const isOpeningAppContextMenu = (items: any[]) => {
  if (!items?.length) return false
  return !!findInReactTree(
    items,
    (x) =>
      x?.props?.onSelected &&
      x?.props?.onSelected.toString().includes('launchSource')
  )
}

const handleItemDupes = (items: any[]) => {
  const gtmIdx = items.findIndex(
    (x: any) => x?.key === 'game-theme-music-change-music'
  )
  if (gtmIdx != -1) items.splice(gtmIdx, 1)
}

const patchMenuItems = (menuItems: any[], appid: number) => {
  let updatedAppid: number = appid
  // find the first menu component that has the correct appid assigned to _owner
  const parentOverview = menuItems.find(
    (x: any) =>
      x?._owner?.pendingProps?.overview?.appid &&
      x._owner.pendingProps.overview.appid !== appid
  )
  if (parentOverview) {
    updatedAppid = parentOverview._owner.pendingProps.overview.appid
  }
  // Oct 2025 client
  if (updatedAppid === appid) {
    const foundApp = findInTree(menuItems, (x) => x?.app?.appid, {
      walkable: ['props', 'children']
    })
    if (foundApp) {
      updatedAppid = foundApp.app.appid
    }
  }
  spliceChangeMusic(menuItems, updatedAppid)
}

/**
 * Patches the game context menu.
 * @param LibraryContextMenu The game context menu.
 * @returns A patch to remove when the plugin dismounts.
 */
const contextMenuPatch = (LibraryContextMenu: any) => {
  const patches: {
    outer?: Patch
    inner?: Patch
    unpatch: () => void
  } = {
    unpatch: () => {
      return null
    }
  }
  patches.outer = afterPatch(
    LibraryContextMenu.prototype,
    'render',
    (_: Record<string, unknown>[], component: any) => {
      let appid = 0
      if (component._owner) {
        appid = component._owner.pendingProps.overview.appid
      } else {
        // Oct 2025 client
        const foundApp = findInTree(
          component.props.children,
          (x) => x?.app?.appid,
          { walkable: ['props', 'children'] }
        )
        if (foundApp) {
          appid = foundApp.app.appid
        }
      }

      if (!patches.inner) {
        patches.inner = afterPatch(component, 'type', (_: any, ret: any) => {
          // initial render
          afterPatch(ret.type.prototype, 'render', (_: any, ret2: any) => {
            const menuItems = ret2.props.children[0]
            if (!isOpeningAppContextMenu(menuItems)) return ret2
            try {
              handleItemDupes(menuItems)
            } catch {
              return ret2
            }
            patchMenuItems(menuItems, appid)
            return ret2
          })

          // when steam decides to refresh app overview
          afterPatch(
            ret.type.prototype,
            'shouldComponentUpdate',
            ([nextProps]: any, shouldUpdate: any) => {
              try {
                handleItemDupes(nextProps.children)
              } catch {
                return shouldUpdate
              }

              if (shouldUpdate === true) {
                patchMenuItems(nextProps.children, appid)
              }

              return shouldUpdate
            }
          )
          return ret
        })
      } else {
        spliceChangeMusic(component.props.children, appid)
      }

      return component
    }
  )
  patches.unpatch = () => {
    patches.outer?.unpatch()
    patches.inner?.unpatch()
  }
  return patches
}

/**
 * Game context menu component.
 */
export const LibraryContextMenu = fakeRenderComponent(
  Object.values(
    findModuleByExport(
      (e: Export) => e?.toString && e.toString().includes('().LibraryContextMenu')
    )
  ).find((sibling) => sibling?.toString().includes('navigator:')) as FC
).type

export default contextMenuPatch
