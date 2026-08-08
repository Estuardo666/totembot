import { templates } from "./templates/index.js";

export class TemplateRenderer {
  render(
    templateId: string,
    variables: unknown,
  ): { readonly templateId: string; readonly version: number; readonly text: string } {
    const template = templates.get(templateId);
    if (template === undefined) throw new Error(`Template not found: ${templateId}`);
    const parsed = template.schema.safeParse(variables);
    if (!parsed.success) throw new Error(`Invalid variables for template ${templateId}`);
    const text = template.render(parsed.data);
    if (text.length > 1000)
      throw new Error(`Rendered template exceeds 1000 characters: ${templateId}`);
    return { templateId, version: template.version, text };
  }
}
