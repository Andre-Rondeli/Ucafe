import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Produto, Sku } from '@/lib/tipos'

interface LinhaProduto {
  id: string
  nome: string
  descricao: string | null
  peso_kg: number
  foto_url: string | null
  sku_legado: Sku | null
  ativo: boolean
  ordem: number
}

function mapear(linha: LinhaProduto): Produto {
  return {
    id: linha.id,
    nome: linha.nome,
    descricao: linha.descricao,
    pesoKg: Number(linha.peso_kg),
    fotoUrl: linha.foto_url,
    skuLegado: linha.sku_legado,
    ativo: linha.ativo,
    ordem: linha.ordem,
  }
}

export function useProdutos() {
  return useQuery({
    queryKey: ['produtos'],
    queryFn: async (): Promise<Produto[]> => {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, descricao, peso_kg, foto_url, sku_legado, ativo, ordem')
        .order('ordem')
        .order('nome')
      if (error) throw new Error(error.message)
      return (data as LinhaProduto[]).map(mapear)
    },
    // catálogo muda raramente; evita ida ao banco toda vez que a tela de pedido abre
    staleTime: 5 * 60_000,
  })
}

/** sku_legado nunca é editável pela tela — só os 2 produtos semeados na migration têm. */
export type ProdutoInput = Omit<Produto, 'id' | 'skuLegado'> & { id?: string }

/** Devolve o id do produto salvo — o custo é gravado em seguida, e produto novo só tem id depois do insert. */
export function useSalvarProduto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (produto: ProdutoInput): Promise<string> => {
      const linha = {
        nome: produto.nome,
        descricao: produto.descricao,
        peso_kg: produto.pesoKg,
        foto_url: produto.fotoUrl,
        ativo: produto.ativo,
        ordem: produto.ordem,
      }
      const resposta = produto.id
        ? await supabase.from('produtos').update(linha).eq('id', produto.id).select('id').single()
        : await supabase.from('produtos').insert(linha).select('id').single()
      if (resposta.error) throw new Error(resposta.error.message)
      return (resposta.data as { id: string }).id
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['produtos'] }),
  })
}

export const TAMANHO_MAXIMO_BYTES = 2 * 1024 * 1024
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']

/** Sobe a foto pro bucket público `produtos` e devolve a URL pública. Valida no cliente antes de subir. */
export function useUploadFotoProduto() {
  return useMutation({
    mutationFn: async (arquivo: File): Promise<string> => {
      if (!TIPOS_ACEITOS.includes(arquivo.type)) {
        throw new Error('Formato de imagem não aceito. Envie um arquivo JPEG, PNG ou WebP.')
      }
      if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
        throw new Error('A imagem precisa ter até 2 MB.')
      }
      const extensao = arquivo.name.includes('.') ? arquivo.name.split('.').pop() : 'jpg'
      const nomeArquivo = `${crypto.randomUUID()}.${extensao}`
      const { error } = await supabase.storage.from('produtos').upload(nomeArquivo, arquivo)
      if (error) throw new Error(error.message)
      const { data } = supabase.storage.from('produtos').getPublicUrl(nomeArquivo)
      return data.publicUrl
    },
  })
}
