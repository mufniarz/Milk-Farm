import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { TranslateService } from '@ngx-translate/core';
import { Recipe } from '../models/recipe.model';
import { NUTRIENTS_MASTER } from '../data/initial-data';
import { TargetService } from './target.service';
import { FarmContextService } from './farm-context.service';

interface ExportRequest {
  recipe: {
    name: string;
    animalGroupId: string;
    /** Localized group label, e.g. "Vacche in lattazione". */
    animalGroupLabel: string;
    /** Herd size the ration is mixed for; drives the "totale carico" rows. */
    animalCount: number;
    totalAsFed: number;
    totalDM: number;
    cost: number;
    nutrientAnalysis: Record<string, number>;
  };
  feeds: {
    feedName: string;
    category: string;
    pricePerKg: number;
    kgAsFed: number;
    kgDM: number;
    moisturePct: number;
    cost: number;
  }[];
  /** Ordered nutrient display metadata for the analysis section. */
  nutrients: { code: string; label: string; unit: string }[];
  /** Effective target ranges ("valori ideali") for the recipe's animal group. */
  targets: {
    code: string;
    min: number | null;
    max: number | null;
    source: 'reference' | 'override';
    reason: string | null;
  }[];
}

interface ExportResult {
  filename: string;
  contentBase64: string;
  mimeType: string;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private functions = inject(Functions);
  private translate = inject(TranslateService);
  private targetService = inject(TargetService);
  private farmContext = inject(FarmContextService);

  /** i18n key for the recipe's animal group label. */
  private static readonly GROUP_KEYS: Record<string, string> = {
    lactating: 'RECIPES.LACTATING',
    dry: 'RECIPES.DRY',
    heifer: 'RECIPES.HEIFER',
  };

  /**
   * Call the export_recipe Cloud Function and trigger a browser download
   * of the generated .xlsx workbook. The workbook reproduces the original
   * spreadsheet layout (FORAGGI / CONCENTRATI / valori stimati / valori ideali).
   */
  async exportRecipeToExcel(recipe: Recipe): Promise<void> {
    const callable = httpsCallable<ExportRequest, ExportResult>(
      this.functions,
      'export_recipe',
    );

    const feeds = (recipe.feeds ?? []).map((f) => ({
      feedName: f.feedName,
      category: f.feedCategory,
      pricePerKg: f.kgAsFed > 0 ? f.cost / f.kgAsFed : 0,
      kgAsFed: f.kgAsFed,
      kgDM: f.kgDM,
      moisturePct: f.kgAsFed > 0 ? (1 - f.kgDM / f.kgAsFed) * 100 : 0,
      cost: f.cost,
    }));

    const nutrients = NUTRIENTS_MASTER.map((n) => ({
      code: n.code,
      label: n.nameIt,
      unit: n.unit,
    }));

    const effectiveTargets = await this.targetService.getEffectiveTargets(
      this.farmContext.activeFarmId(),
      recipe.animalGroupId,
    );
    const targets = effectiveTargets.map((t) => ({
      code: t.nutrientCode,
      min: t.minValue,
      max: t.maxValue,
      source: t.source,
      reason: t.reason ?? null,
    }));

    const { data } = await callable({
      recipe: {
        name: recipe.name,
        animalGroupId: recipe.animalGroupId,
        animalGroupLabel: this.translate.instant(
          ExportService.GROUP_KEYS[recipe.animalGroupId] ?? 'RECIPES.ANIMAL_GROUP',
        ),
        animalCount: recipe.animalCount ?? 1,
        totalAsFed: recipe.totalAsFed,
        totalDM: recipe.totalDM,
        cost: recipe.cost,
        nutrientAnalysis: recipe.nutrientAnalysis ?? {},
      },
      feeds,
      nutrients,
      targets,
    });

    this.triggerDownload(data);
  }

  private triggerDownload(result: ExportResult): void {
    const byteChars = atob(result.contentBase64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      bytes[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: result.mimeType });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
