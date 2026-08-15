/**
 * Ponytail settings section: user-editable, grouped hurry-up prompts.
 * Registers into `settings.section`, so it renders as one page of the dsh
 * settings panel sidebar. Editing state is component-local; every committed
 * change goes through {@link PonytailSettingsController}, which persists to
 * the Host settings document when available.
 */

import { useSyncExternalStore, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PonytailSettingsController } from './settings-controller.ts'
import { promptText } from '../ponytail-settings.ts'
import type { PonytailGroup } from '../ponytail-settings.ts'
import css from './PonytailSettingsSection.module.css'

/** Slot inject face supplied by the plugin apply. */
export interface PonytailSettingsSectionInjected {
  /** Single settings owner shared with the dock prompt picker. */
  controller: PonytailSettingsController
}

/** Composed props: settings-section owner share plus the inject face. */
export type PonytailSettingsSectionProps =
  PropsRuntime<'settings.section'> & PonytailSettingsSectionInjected

/** Target of the one-at-a-time prompt editor. */
interface PromptEditTarget {
  groupId: string
  promptId: string
  text: string
}

/** Target of the one-at-a-time group name editor. */
interface GroupNameTarget {
  groupId: string
  name: string
}

/** Number of non-empty prompts one group would actually send. */
function sendableCount(group: PonytailGroup): number {
  return group.prompts.reduce((count, prompt) => count + (promptText(prompt) === '' ? 0 : 1), 0)
}

/**
 * Render the Ponytail settings page.
 * @param props - slot-composed props (inject face arrives flat).
 */
export function PonytailSettingsSection({ controller }: PonytailSettingsSectionProps) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroup, setEditingGroup] = useState<GroupNameTarget | undefined>(undefined)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [editingPrompt, setEditingPrompt] = useState<PromptEditTarget | undefined>(undefined)
  const [promptDraft, setPromptDraft] = useState('')
  const [addingPromptFor, setAddingPromptFor] = useState<string | undefined>(undefined)
  const [newPromptDraft, setNewPromptDraft] = useState('')

  const { settings, status, writable, saving, error } = snapshot

  const startEditPrompt = (groupId: string, promptId: string, text: string): void => {
    setAddingPromptFor(undefined)
    setEditingPrompt({ groupId, promptId, text })
    setPromptDraft(text)
  }

  const savePromptEdit = (): void => {
    if (editingPrompt === undefined) return
    controller.updatePrompt(editingPrompt.groupId, editingPrompt.promptId, promptDraft)
    setEditingPrompt(undefined)
    setPromptDraft('')
  }

  const saveAddedPrompt = (groupId: string): void => {
    controller.addPrompt(groupId, newPromptDraft)
    setAddingPromptFor(undefined)
    setNewPromptDraft('')
  }

  const startEditGroup = (groupId: string, name: string): void => {
    setEditingGroup({ groupId, name })
    setGroupNameDraft(name)
  }

  const saveGroupName = (): void => {
    if (editingGroup === undefined) return
    controller.renameGroup(editingGroup.groupId, groupNameDraft)
    setEditingGroup(undefined)
    setGroupNameDraft('')
  }

  const saveNewGroup = (): void => {
    controller.addGroup(newGroupName)
    setAddingGroup(false)
    setNewGroupName('')
  }

  return (
    <div className={css.section}>
      <div className={css.heading}>
        <div>
          <h2 className={css.title}>Ponytail 提示词</h2>
          <p className={css.intro}>
            自定义抽鞭时发送给模型的催促提示词。按分组整理；抽鞭时会从所有启用分组中随机挑选一条。
          </p>
        </div>
        <div className={css.headingActions}>
          <button
            type="button"
            className={css.secondaryButton}
            disabled={saving}
            onClick={() => {
              if (window.confirm('恢复为默认提示词？当前的所有分组和编辑都会被覆盖。')) controller.resetToDefaults()
            }}
          >
            恢复默认
          </button>
          <button
            type="button"
            className={css.primaryButton}
            disabled={saving}
            onClick={() => {
              setAddingGroup(true)
              setNewGroupName('')
            }}
          >
            ＋ 新建分组
          </button>
        </div>
      </div>

      {status === 'loading' ? <p className={css.statusLine}>正在读取设置…</p> : null}
      {!writable && status !== 'loading'
        ? <p className={css.notice}>设置存储不可写：本次修改只在当前页面内生效。</p>
        : null}
      {error !== undefined ? <p className={css.error} role="alert">保存失败：{error}</p> : null}
      {saving ? <p className={css.statusLine} role="status">正在保存…</p> : null}

      {addingGroup
        ? (
          <div className={css.inlineForm}>
            <input
              className={css.textInput}
              value={newGroupName}
              autoFocus
              placeholder="分组名称，例如：通用、代码、文档"
              aria-label="新分组名称"
              onChange={event => { setNewGroupName(event.target.value) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveNewGroup()
                if (event.key === 'Escape') setAddingGroup(false)
              }}
            />
            <button type="button" className={css.primaryButton} onClick={saveNewGroup}>创建</button>
            <button type="button" className={css.secondaryButton} onClick={() => setAddingGroup(false)}>取消</button>
          </div>
        )
        : null}

      {settings.groups.length === 0
        ? (
          <p className={css.empty}>
            还没有分组。点击「新建分组」创建第一个分组，再往里面添加提示词。
          </p>
        )
        : (
          <div className={css.groups}>
            {settings.groups.map(group => {
              const editingName = editingGroup?.groupId === group.id
              return (
                <details key={group.id} className={css.group} open data-group-id={group.id}>
                  <summary className={css.summary}>
                    <input
                      type="checkbox"
                      className={css.groupEnabled}
                      checked={group.enabled}
                      aria-label={`启用分组「${group.name}」`}
                      title={group.enabled ? '点击停用该分组' : '点击启用该分组'}
                      onClick={event => { event.stopPropagation() }}
                      onChange={event => { controller.setGroupEnabled(group.id, event.target.checked) }}
                    />
                    {editingName
                      ? (
                        <input
                          className={css.groupNameInput}
                          value={groupNameDraft}
                          autoFocus
                          aria-label="分组名称"
                          onClick={event => { event.stopPropagation() }}
                          onChange={event => { setGroupNameDraft(event.target.value) }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') saveGroupName()
                            if (event.key === 'Escape') setEditingGroup(undefined)
                          }}
                        />
                      )
                      : <span className={css.groupName}>{group.name}</span>}
                    <span className={css.groupCount}>
                      {sendableCount(group)} / {group.prompts.length} 条可发送
                    </span>
                    <span className={css.summaryActions}>
                      {editingName
                        ? (
                          <>
                            <button
                              type="button"
                              className={css.secondaryButton}
                              onClick={(event) => {
                                event.preventDefault()
                                saveGroupName()
                              }}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className={css.secondaryButton}
                              onClick={(event) => {
                                event.preventDefault()
                                setEditingGroup(undefined)
                              }}
                            >
                              取消
                            </button>
                          </>
                        )
                        : (
                          <>
                            <button
                              type="button"
                              className={css.secondaryButton}
                              onClick={(event) => {
                                event.preventDefault()
                                startEditGroup(group.id, group.name)
                              }}
                            >
                              重命名
                            </button>
                            <button
                              type="button"
                              className={css.dangerButton}
                              onClick={(event) => {
                                event.preventDefault()
                                if (window.confirm(`删除分组「${group.name}」及其中的 ${group.prompts.length} 条提示词？`)) {
                                  controller.deleteGroup(group.id)
                                  if (editingPrompt?.groupId === group.id) setEditingPrompt(undefined)
                                  if (addingPromptFor === group.id) setAddingPromptFor(undefined)
                                }
                              }}
                            >
                              删除分组
                            </button>
                          </>
                        )}
                    </span>
                  </summary>

                  <div className={css.groupBody}>
                    {group.prompts.length === 0
                      ? <p className={css.emptyPrompts}>该分组还没有提示词。</p>
                      : (
                        <ul className={css.prompts}>
                          {group.prompts.map(prompt => {
                            const editing = editingPrompt !== undefined
                              && editingPrompt.groupId === group.id
                              && editingPrompt.promptId === prompt.id
                            return (
                              <li key={prompt.id} className={css.promptRow} data-prompt-id={prompt.id}>
                                {editing
                                  ? (
                                    <div className={css.promptEditor}>
                                      <textarea
                                        className={css.textarea}
                                        value={promptDraft}
                                        autoFocus
                                        rows={2}
                                        aria-label="提示词内容"
                                        onChange={event => { setPromptDraft(event.target.value) }}
                                      />
                                      <div className={css.rowActions}>
                                        <button type="button" className={css.primaryButton} onClick={savePromptEdit}>保存</button>
                                        <button
                                          type="button"
                                          className={css.secondaryButton}
                                          onClick={() => {
                                            setEditingPrompt(undefined)
                                            setPromptDraft('')
                                          }}
                                        >
                                          取消
                                        </button>
                                      </div>
                                    </div>
                                  )
                                  : (
                                    <div className={css.promptView}>
                                      <p className={promptText(prompt) === '' ? `${css.promptText} ${css.promptTextEmpty}` : css.promptText}>
                                        {promptText(prompt) === '' ? '空提示词（不会被发送）' : promptText(prompt)}
                                      </p>
                                      <div className={css.promptFooter}>
                                        <label className={css.groupSelectLabel}>
                                          分组
                                          <select
                                            className={css.select}
                                            value={group.id}
                                            aria-label="提示词所属分组"
                                            onChange={(event) => { controller.movePrompt(group.id, prompt.id, event.target.value) }}
                                          >
                                            {settings.groups.map(candidate => (
                                              <option key={candidate.id} value={candidate.id}>
                                                {candidate.name}{candidate.enabled ? '' : '（停用）'}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <span className={css.rowActions}>
                                          <button
                                            type="button"
                                            className={css.secondaryButton}
                                            onClick={() => startEditPrompt(group.id, prompt.id, prompt.text)}
                                          >
                                            编辑
                                          </button>
                                          <button
                                            type="button"
                                            className={css.dangerButton}
                                            onClick={() => {
                                              if (window.confirm('删除这条提示词？')) controller.deletePrompt(group.id, prompt.id)
                                            }}
                                          >
                                            删除
                                          </button>
                                        </span>
                                      </div>
                                    </div>
                                  )}
                              </li>
                            )
                          })}
                        </ul>
                      )}

                    {addingPromptFor === group.id
                      ? (
                        <div className={css.inlineForm}>
                          <textarea
                            className={css.textarea}
                            value={newPromptDraft}
                            autoFocus
                            rows={2}
                            placeholder="输入抽鞭时发送给模型的提示词"
                            aria-label="新提示词内容"
                            onChange={event => { setNewPromptDraft(event.target.value) }}
                          />
                          <button
                            type="button"
                            className={css.primaryButton}
                            onClick={() => saveAddedPrompt(group.id)}
                          >
                            添加
                          </button>
                          <button
                            type="button"
                            className={css.secondaryButton}
                            onClick={() => {
                              setAddingPromptFor(undefined)
                              setNewPromptDraft('')
                            }}
                          >
                            取消
                          </button>
                        </div>
                      )
                      : (
                        <button
                          type="button"
                          className={css.addPromptButton}
                          onClick={() => {
                            setEditingPrompt(undefined)
                            setAddingPromptFor(group.id)
                            setNewPromptDraft('')
                          }}
                        >
                          ＋ 添加提示词
                        </button>
                      )}
                  </div>
                </details>
              )
            })}
          </div>
        )}
    </div>
  )
}
