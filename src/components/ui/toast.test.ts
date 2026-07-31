import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createToastStore } from '@/components/ui/toast'

/**
 * A fila do toast é a parte que quebra em silêncio: cronômetro que não é
 * cancelado ao fechar na mão derruba o aviso seguinte, e hover que não pausa
 * faz o erro sumir enquanto a pessoa ainda está lendo. Nada disso aparece em
 * `tsc` — por isso o teste é da fila, não do desenho.
 */
describe('createToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('empilha na ordem de chegada', () => {
    const store = createToastStore()
    store.success('salvo')
    store.error('falhou')

    expect(store.getSnapshot().map((toast) => toast.message)).toEqual(['salvo', 'falhou'])
    expect(store.getSnapshot().map((toast) => toast.variant)).toEqual(['success', 'error'])
  })

  it('cada aviso tem id próprio', () => {
    const store = createToastStore()
    const first = store.success('a')
    const second = store.success('a')

    expect(first).not.toBe(second)
  })

  it('some sozinho quando o tempo acaba', () => {
    const store = createToastStore()
    store.success('salvo', { duration: 1000 })

    vi.advanceTimersByTime(999)
    expect(store.getSnapshot()).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(store.getSnapshot()).toHaveLength(0)
  })

  it('erro fica mais tempo na tela que sucesso', () => {
    const store = createToastStore()
    store.success('salvo')
    store.error('janela de 24h fechada')

    vi.advanceTimersByTime(4000)
    expect(store.getSnapshot().map((toast) => toast.message)).toEqual(['janela de 24h fechada'])
  })

  it('fechar na mão tira na hora', () => {
    const store = createToastStore()
    const id = store.success('salvo')
    store.error('falhou')

    store.dismiss(id)
    expect(store.getSnapshot().map((toast) => toast.message)).toEqual(['falhou'])
  })

  it('fechar na mão cancela o cronômetro (não derruba quem entrou depois)', () => {
    const store = createToastStore()
    const id = store.success('primeiro', { duration: 1000 })
    store.dismiss(id)

    // Se o timeout do fechado continuasse vivo, ele expiraria aqui e o
    // `dismiss` atrasado poderia levar junto o aviso seguinte.
    store.success('segundo', { duration: 5000 })
    vi.advanceTimersByTime(1000)

    expect(store.getSnapshot().map((toast) => toast.message)).toEqual(['segundo'])
  })

  it('fechar duas vezes o mesmo id não faz nada', () => {
    const store = createToastStore()
    const id = store.success('salvo')

    store.dismiss(id)
    store.dismiss(id)
    expect(store.getSnapshot()).toHaveLength(0)
  })

  it('hover pausa o cronômetro e soltar retoma de onde parou', () => {
    const store = createToastStore()
    const id = store.error('falhou', { duration: 1000 })

    vi.advanceTimersByTime(400)
    store.pause(id)

    vi.advanceTimersByTime(10_000)
    expect(store.getSnapshot()).toHaveLength(1)

    store.resume(id)
    vi.advanceTimersByTime(599)
    expect(store.getSnapshot()).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(store.getSnapshot()).toHaveLength(0)
  })

  it('hover num aviso segura a pilha inteira', () => {
    const store = createToastStore()
    const id = store.error('falhou', { duration: 5000 })
    store.pause(id)
    store.success('salvo', { duration: 1000 })

    vi.advanceTimersByTime(5000)
    expect(store.getSnapshot()).toHaveLength(2)

    store.resume(id)
    vi.advanceTimersByTime(1000)
    expect(store.getSnapshot().map((toast) => toast.message)).toEqual(['falhou'])
  })

  it('pausa repetida não zera o tempo já corrido', () => {
    const store = createToastStore()
    const id = store.success('salvo', { duration: 1000 })

    vi.advanceTimersByTime(600)
    store.pause(id)
    store.pause(id)
    store.resume(id)

    vi.advanceTimersByTime(400)
    expect(store.getSnapshot()).toHaveLength(0)
  })

  it('fechar o aviso que estava sob o cursor destrava a fila', () => {
    // Fechar no X não dispara `mouseleave`: sem soltar a marca de hover junto
    // com o aviso, a pilha ficaria congelada para sempre.
    const store = createToastStore()
    const hoveredId = store.error('falhou', { duration: 5000 })
    store.pause(hoveredId)
    store.success('salvo', { duration: 1000 })

    store.dismiss(hoveredId)
    vi.advanceTimersByTime(1000)

    expect(store.getSnapshot()).toHaveLength(0)
  })

  it('aviso empurrado para fora pelo limite não deixa a fila congelada', () => {
    const store = createToastStore({ max: 1 })
    const hoveredId = store.error('falhou', { duration: 5000 })
    store.pause(hoveredId)

    store.success('salvo', { duration: 1000 })
    vi.advanceTimersByTime(1000)

    expect(store.getSnapshot()).toHaveLength(0)
  })

  it('só o último a soltar destrava a fila', () => {
    const store = createToastStore()
    const first = store.error('falhou', { duration: 1000 })
    const second = store.error('falhou de novo', { duration: 1000 })

    store.pause(first)
    store.pause(second)
    store.resume(first)

    vi.advanceTimersByTime(5000)
    expect(store.getSnapshot()).toHaveLength(2)

    store.resume(second)
    vi.advanceTimersByTime(1000)
    expect(store.getSnapshot()).toHaveLength(0)
  })

  it('estourou o máximo: o mais antigo sai', () => {
    const store = createToastStore({ max: 2 })
    store.success('um')
    store.success('dois')
    store.success('três')

    expect(store.getSnapshot().map((toast) => toast.message)).toEqual(['dois', 'três'])
  })

  it('o descartado por excesso não leva ninguém junto ao expirar', () => {
    const store = createToastStore({ max: 1 })
    store.success('um', { duration: 1000 })
    store.success('dois', { duration: 5000 })

    vi.advanceTimersByTime(1000)
    expect(store.getSnapshot().map((toast) => toast.message)).toEqual(['dois'])
  })

  it('avisa quem assina e para de avisar quem cancela', () => {
    const store = createToastStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    const id = store.success('salvo')
    expect(listener).toHaveBeenCalledTimes(1)

    store.dismiss(id)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    store.success('outro')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('a referência da lista só muda quando a lista muda', () => {
    const store = createToastStore()
    const before = store.getSnapshot()

    expect(store.getSnapshot()).toBe(before)

    store.success('salvo')
    expect(store.getSnapshot()).not.toBe(before)
  })

  it('clear esvazia a fila e mata os cronômetros', () => {
    const store = createToastStore()
    store.success('um', { duration: 1000 })
    store.clear()

    store.success('dois', { duration: 5000 })
    vi.advanceTimersByTime(1000)

    expect(store.getSnapshot().map((toast) => toast.message)).toEqual(['dois'])
  })
})
