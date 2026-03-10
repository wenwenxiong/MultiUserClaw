import { useState, useEffect } from 'react'
import { Brain, CheckCircle, Loader2, Search, Plus, Trash2, Save, X, Star } from 'lucide-react'
import { listModels, updateModelsConfig } from '../lib/api'
import type { ModelChoice } from '../lib/api'

const API_TYPES = [
  { value: 'openai-completions', label: 'OpenAI Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'google-generative-ai', label: 'Google Generative AI' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'bedrock-converse-stream', label: 'AWS Bedrock' },
]

interface ProviderFormData {
  name: string
  baseUrl: string
  api: string
  apiKey: string
  models: { id: string; name: string }[]
}

const emptyProvider: ProviderFormData = {
  name: '',
  baseUrl: '',
  api: 'openai-completions',
  apiKey: '',
  models: [{ id: '', name: '' }],
}

export default function AIModels() {
  const [models, setModels] = useState<ModelChoice[]>([])
  const [configuredModel, setConfiguredModel] = useState('')
  const [configuredProviders, setConfiguredProviders] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  // Add/edit provider form
  const [showForm, setShowForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderFormData>({ ...emptyProvider })

  const reload = () => {
    setLoading(true)
    listModels()
      .then(data => {
        setModels(data.models || [])
        setConfiguredModel(data.configuredModel || '')
        setConfiguredProviders(data.configuredProviders || {})
      })
      .catch(err => setError(err?.message || '加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  const filtered = models.filter(m => {
    const term = search.toLowerCase()
    return m.name.toLowerCase().includes(term) ||
      m.id.toLowerCase().includes(term) ||
      m.provider.toLowerCase().includes(term)
  })

  const grouped = filtered.reduce<Record<string, ModelChoice[]>>((acc, m) => {
    const provider = m.provider || 'other'
    if (!acc[provider]) acc[provider] = []
    acc[provider].push(m)
    return acc
  }, {})

  const providers = Object.keys(grouped).sort()

  const configuredModelId = configuredModel.includes('/')
    ? configuredModel.split('/').slice(1).join('/')
    : configuredModel

  const formatContextWindow = (n?: number) => {
    if (!n) return null
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${Math.round(n / 1000)}K`
    return String(n)
  }

  // Set as default model
  const handleSetDefault = async (provider: string, modelId: string) => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await updateModelsConfig({ defaultModel: `${provider}/${modelId}` })
      setConfiguredModel(`${provider}/${modelId}`)
      setSuccess(`默认模型已设置为 ${provider}/${modelId}`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err?.message || '设置失败')
    } finally {
      setSaving(false)
    }
  }

  // Open add form
  const handleAdd = () => {
    setForm({ ...emptyProvider })
    setEditingProvider(null)
    setShowForm(true)
  }

  // Open edit form
  const handleEdit = (providerName: string) => {
    const p = configuredProviders[providerName]
    if (!p) return
    setForm({
      name: providerName,
      baseUrl: p.baseUrl || '',
      api: p.api || 'openai-completions',
      apiKey: p.apiKey || '',
      models: (p.models || []).map((m: any) => ({ id: m.id || '', name: m.name || m.id || '' })),
    })
    if (form.models.length === 0) {
      setForm(f => ({ ...f, models: [{ id: '', name: '' }] }))
    }
    setEditingProvider(providerName)
    setShowForm(true)
  }

  // Save provider
  const handleSave = async () => {
    if (!form.name.trim()) { setError('提供商名称不能为空'); return }
    if (!form.baseUrl.trim()) { setError('Base URL 不能为空'); return }
    const validModels = form.models.filter(m => m.id.trim())
    if (validModels.length === 0) { setError('至少添加一个模型'); return }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const newProviders = { ...configuredProviders }

      // If renaming, delete old key
      if (editingProvider && editingProvider !== form.name.trim()) {
        delete newProviders[editingProvider]
      }

      newProviders[form.name.trim()] = {
        baseUrl: form.baseUrl.trim(),
        api: form.api,
        apiKey: form.apiKey.trim() || undefined,
        models: validModels.map(m => ({
          id: m.id.trim(),
          name: m.name.trim() || m.id.trim(),
        })),
      }

      await updateModelsConfig({ providers: newProviders })
      setShowForm(false)
      setSuccess('提供商配置已保存')
      setTimeout(() => setSuccess(''), 3000)
      reload()
    } catch (err: any) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // Delete provider
  const handleDeleteProvider = async (providerName: string) => {
    if (!confirm(`确定删除提供商 "${providerName}" 及其所有模型配置？`)) return
    setSaving(true)
    setError('')
    try {
      const newProviders = { ...configuredProviders }
      delete newProviders[providerName]
      await updateModelsConfig({ providers: newProviders })
      setSuccess(`已删除提供商 ${providerName}`)
      setTimeout(() => setSuccess(''), 3000)
      reload()
    } catch (err: any) {
      setError(err?.message || '删除失败')
    } finally {
      setSaving(false)
    }
  }

  // Model list helpers in form
  const addModelRow = () => setForm(f => ({ ...f, models: [...f.models, { id: '', name: '' }] }))
  const removeModelRow = (i: number) => setForm(f => ({ ...f, models: f.models.filter((_, j) => j !== i) }))
  const updateModelRow = (i: number, field: 'id' | 'name', value: string) => {
    setForm(f => ({
      ...f,
      models: f.models.map((m, j) => j === i ? { ...m, [field]: value } : m),
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-accent-blue" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">AI 模型</h1>
          <p className="mt-1 text-sm text-dark-text-secondary">
            共 {models.length} 个可用模型
            {configuredModel && (
              <span className="ml-2">
                · 默认: <code className="rounded bg-dark-card px-1.5 py-0.5 text-xs text-accent-blue">{configuredModel}</code>
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 transition-colors"
        >
          <Plus size={16} />
          添加提供商
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-accent-green/10 p-3 text-sm text-accent-green">{success}</div>
      )}

      {/* Add/Edit Provider Form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-accent-blue/30 bg-dark-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-dark-text">
              {editingProvider ? `编辑提供商: ${editingProvider}` : '添加新提供商'}
            </h2>
            <button onClick={() => setShowForm(false)} className="text-dark-text-secondary hover:text-dark-text">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-dark-text-secondary">提供商名称 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例如: openai, anthropic, my-proxy"
                  className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text outline-none focus:border-accent-blue placeholder:text-dark-text-secondary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-dark-text-secondary">API 类型</label>
                <select
                  value={form.api}
                  onChange={e => setForm(f => ({ ...f, api: e.target.value }))}
                  className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text outline-none focus:border-accent-blue"
                >
                  {API_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-dark-text-secondary">Base URL *</label>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text outline-none focus:border-accent-blue placeholder:text-dark-text-secondary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-dark-text-secondary">API Key</label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  placeholder="sk-..."
                  className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text outline-none focus:border-accent-blue placeholder:text-dark-text-secondary"
                />
              </div>
            </div>

            {/* Models list */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-dark-text-secondary">模型列表 *</label>
                <button
                  onClick={addModelRow}
                  className="flex items-center gap-1 text-xs text-accent-blue hover:text-accent-blue/80"
                >
                  <Plus size={12} /> 添加模型
                </button>
              </div>
              <div className="space-y-2">
                {form.models.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={m.id}
                      onChange={e => updateModelRow(i, 'id', e.target.value)}
                      placeholder="模型 ID，例如 gpt-4o"
                      className="flex-1 rounded-lg border border-dark-border bg-dark-bg px-3 py-1.5 text-sm text-dark-text outline-none focus:border-accent-blue placeholder:text-dark-text-secondary"
                    />
                    <input
                      type="text"
                      value={m.name}
                      onChange={e => updateModelRow(i, 'name', e.target.value)}
                      placeholder="显示名称（可选）"
                      className="flex-1 rounded-lg border border-dark-border bg-dark-bg px-3 py-1.5 text-sm text-dark-text outline-none focus:border-accent-blue placeholder:text-dark-text-secondary"
                    />
                    {form.models.length > 1 && (
                      <button
                        onClick={() => removeModelRow(i)}
                        className="text-dark-text-secondary hover:text-accent-red"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                保存
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-dark-border px-4 py-2 text-sm text-dark-text-secondary hover:text-dark-text"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configured providers summary */}
      {Object.keys(configuredProviders).length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-dark-text">已配置的提供商</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(configuredProviders).map(([name, p]: [string, any]) => (
              <div
                key={name}
                className="flex items-center gap-2 rounded-lg border border-dark-border bg-dark-card px-3 py-2"
              >
                <span className="text-sm font-medium text-dark-text">{name}</span>
                <span className="text-xs text-dark-text-secondary">
                  {(p.models || []).length} 个模型
                </span>
                <button
                  onClick={() => handleEdit(name)}
                  className="text-xs text-accent-blue hover:underline"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDeleteProvider(name)}
                  className="text-dark-text-secondary hover:text-accent-red"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-dark-border bg-dark-card px-4 py-2.5">
        <Search size={16} className="text-dark-text-secondary" />
        <input
          type="text"
          placeholder="搜索模型名称、ID 或提供商..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm text-dark-text outline-none placeholder:text-dark-text-secondary"
        />
      </div>

      {/* Model list by provider */}
      {providers.length === 0 ? (
        <div className="rounded-xl border border-dark-border bg-dark-card p-12 text-center text-sm text-dark-text-secondary">
          {search ? '未找到匹配的模型' : '暂无可用模型'}
        </div>
      ) : (
        <div className="space-y-6">
          {providers.map(provider => (
            <div key={provider}>
              <h2 className="mb-2 text-sm font-semibold text-dark-text-secondary uppercase tracking-wider">
                {provider}
                <span className="ml-2 text-xs font-normal normal-case">({grouped[provider].length})</span>
              </h2>
              <div className="rounded-xl border border-dark-border bg-dark-card overflow-hidden">
                {grouped[provider].map((model, i) => {
                  const fullId = `${provider}/${model.id}`
                  const isConfigured = configuredModel === fullId || model.id === configuredModelId
                  return (
                    <div
                      key={model.id}
                      className={`flex items-center justify-between px-5 py-3 ${
                        i < grouped[provider].length - 1 ? 'border-b border-dark-border' : ''
                      } ${isConfigured ? 'bg-accent-blue/5' : 'hover:bg-dark-bg/50'} transition-colors`}
                    >
                      <div className="flex items-center gap-3">
                        <Brain size={18} className={isConfigured ? 'text-accent-blue' : 'text-dark-text-secondary'} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${isConfigured ? 'text-accent-blue' : 'text-dark-text'}`}>
                              {model.name}
                            </span>
                            {isConfigured && (
                              <span className="flex items-center gap-1 rounded-full bg-accent-blue/10 px-2 py-0.5 text-xs text-accent-blue">
                                <CheckCircle size={10} /> 当前使用
                              </span>
                            )}
                            {model.reasoning && (
                              <span className="rounded-full bg-accent-purple/10 px-2 py-0.5 text-xs text-accent-purple">
                                推理
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-dark-text-secondary">{model.id}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {model.contextWindow && (
                          <span className="text-xs text-dark-text-secondary" title="上下文窗口">
                            {formatContextWindow(model.contextWindow)} tokens
                          </span>
                        )}
                        {!isConfigured && (
                          <button
                            onClick={() => handleSetDefault(provider, model.id)}
                            disabled={saving}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-dark-text-secondary hover:text-accent-blue hover:bg-accent-blue/5 transition-colors disabled:opacity-50"
                            title="设为默认模型"
                          >
                            <Star size={12} />
                            设为默认
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
