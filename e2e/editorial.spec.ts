import { test, expect, type Page } from '@playwright/test';

test.describe('Workflow Editorial e Governança com IA (Etapa 10) — E2E', () => {
  async function registerAndLogin(page: Page, name: string): Promise<string> {
    await page.goto('/register');
    const email = `e2e-editorial-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`;

    await page.fill('#register-name', name);
    await page.fill('#register-email', email);
    await page.fill('#register-password', 'SenhaSegura@123');
    await page.fill('#register-confirm-password', 'SenhaSegura@123');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');
    await page.waitForURL('**/dashboard');
    return email;
  }

  test('deve exibir aviso regulatório editorial, criar documento com auxílio de IA e submeter para revisão humana', async ({
    page,
  }) => {
    await registerAndLogin(page, 'Editor Responsável');

    // 1. Navegação para /editorial
    const navLink = page.locator('#nav-link-editorial').first();
    await expect(navLink).toBeVisible();
    await navLink.click();
    await page.waitForURL('**/editorial');

    // 2. Banner Regulatório Obrigatório
    const disclaimer = page.locator('#editorial-regulatory-disclaimer');
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText('Aviso Regulatório e Governança Editorial Interna');
    await expect(disclaimer).toContainText('Revisão humana obrigatória');
    await expect(disclaimer).toContainText('Neutralidade regulatória CVM/ANBIMA');

    // 3. Abrir editor de novo documento
    const newDocButton = page.locator('#editorial-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();

    await expect(page.locator('#editorial-document-editor')).toBeVisible();

    // 4. Assistente de IA - Geração de Rascunho
    const promptInput = page.locator('#editorial-ai-prompt-input');
    await expect(promptInput).toBeVisible();
    await promptInput.fill('Conceitos de disciplina financeira e formação de patrimônio');

    const aiButton = page.locator('#editorial-ai-generate-draft-button');
    await expect(aiButton).toBeVisible();
    await aiButton.click();

    // Aguardar inserção do rascunho sugerido pela IA
    await expect(page.locator('#editorial-input-title')).toHaveValue(/(Guia|Artigo) Educacional:/i);
    await expect(page.locator('#editorial-textarea-content')).toHaveValue(/planejamento patrimonial/i);

    // 5. Salvar Rascunho
    const saveButton = page.locator('#editorial-save-draft-button');
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    await expect(page.getByText('Rascunho salvo com sucesso!')).toBeVisible();

    // 6. Submeter para Revisão Humana
    const submitReviewButton = page.locator('#editorial-submit-review-button');
    await expect(submitReviewButton).toBeVisible();
    await submitReviewButton.click();

    await expect(
      page.getByText('Documento enviado com sucesso para a revisão humana obrigatória!')
    ).toBeVisible();

    // 7. Voltar para a lista e verificar status "Em Revisão"
    const cancelButton = page.locator('#editorial-cancel-button');
    await cancelButton.click();

    await expect(page.locator('#editorial-document-list')).toBeVisible();
    await expect(page.locator('[data-testid="status-badge-in_review"]').first()).toBeVisible();
  });
});
