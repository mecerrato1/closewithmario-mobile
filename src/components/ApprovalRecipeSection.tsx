import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useThemeColors } from '../styles/theme';
import {
  fetchActiveApprovalRecipe,
  getApprovalRecipeFindingsUrl,
  saveApprovalRecipe,
} from '../lib/supabase/approvalRecipes';
import {
  emptyApprovalRecipeForm,
  type ApprovalRecipeFormState,
  type ApprovalRecipeLeadSource,
  type ApprovalRecipeRow,
} from '../lib/types/approvalRecipe';

const PLUM = '#4C1D95';

type ApprovalRecipeSectionProps = {
  leadId: string;
  leadSource: ApprovalRecipeLeadSource;
};

type DisplayRow = {
  label: string;
  value?: string | null;
};

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
};

const hasText = (value?: string | null) => typeof value === 'string' && value.trim().length > 0;

const firstValue = (row: ApprovalRecipeRow | null, keys: string[]) => {
  if (!row) return null;
  const source = row as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined && String(value).trim().length > 0) {
      return value;
    }
  }
  return null;
};

const toStringValue = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const rowToForm = (row: ApprovalRecipeRow | null): ApprovalRecipeFormState => {
  if (!row) return { ...emptyApprovalRecipeForm };

  return {
    ausSystem: toStringValue(firstValue(row, ['aus_type', 'aus_system'])),
    recommendation: toStringValue(firstValue(row, ['recommendation'])),
    findingsDate: toStringValue(firstValue(row, ['findings_date'])),
    productType: toStringValue(firstValue(row, ['loan_product', 'product_type'])),
    loanPurpose: toStringValue(firstValue(row, ['loan_purpose'])),
    propertyType: toStringValue(firstValue(row, ['property_type'])),
    occupancy: toStringValue(firstValue(row, ['occupancy'])),
    purchasePrice: toStringValue(firstValue(row, ['price_value', 'purchase_price'])),
    loanAmount: toStringValue(firstValue(row, ['loan_amount'])),
    ltv: toStringValue(firstValue(row, ['ltv'])),
    cltv: toStringValue(firstValue(row, ['cltv'])),
    hcltv: toStringValue(firstValue(row, ['htl_tv', 'hcltv'])),
    dti: toStringValue(firstValue(row, ['dti'])),
    housingRatio: toStringValue(firstValue(row, ['housing_ratio'])),
    creditScore: toStringValue(firstValue(row, ['credit_score'])),
    reserves: toStringValue(firstValue(row, ['reserves'])),
    strategyNotes: toStringValue(firstValue(row, ['must_not_change', 'strategy_note', 'strategy_notes'])),
    debtStrategy: toStringValue(firstValue(row, ['debt_strategy'])),
    keyConditions: toStringValue(firstValue(row, ['conditions_summary', 'key_conditions'])),
  };
};

const parseNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const formatMoney = (value: unknown) => {
  const numeric = parseNumber(value);
  if (numeric == null || numeric <= 0) return null;
  return numeric.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
};

const formatPercent = (value: unknown) => {
  const numeric = parseNumber(value);
  if (numeric == null) return null;
  return `${numeric.toLocaleString('en-US', {
    maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  })}%`;
};

const formatDate = (value: unknown) => {
  const text = toStringValue(value);
  if (!text) return null;
  const date = new Date(text.includes('T') ? text : `${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateTime = (value: unknown) => {
  const text = toStringValue(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return formatDate(text);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatConfidence = (row: ApprovalRecipeRow | null) => {
  const raw =
    firstValue(row, ['confidence_score']) ??
    (row?.extraction_snapshot && typeof row.extraction_snapshot === 'object'
      ? row.extraction_snapshot.confidence
      : null);
  const numeric = parseNumber(raw);
  if (numeric == null) return null;
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return `${Math.round(percent)}%`;
};

const getAusSystem = (row: ApprovalRecipeRow | null) => toStringValue(firstValue(row, ['aus_type', 'aus_system']));
const getRecommendation = (row: ApprovalRecipeRow | null) => toStringValue(firstValue(row, ['recommendation']));
const getProduct = (row: ApprovalRecipeRow | null) => toStringValue(firstValue(row, ['loan_product', 'product_type']));
const getStrategyNotes = (row: ApprovalRecipeRow | null) => toStringValue(firstValue(row, ['must_not_change', 'strategy_note', 'strategy_notes']));
const getDebtStrategy = (row: ApprovalRecipeRow | null) => toStringValue(firstValue(row, ['debt_strategy']));
const getConditionsSummary = (row: ApprovalRecipeRow | null) => toStringValue(firstValue(row, ['conditions_summary', 'key_conditions']));
const getPdfPath = (row: ApprovalRecipeRow | null) => toStringValue(firstValue(row, ['pdf_storage_path', 'findings_file_path']));
const getPdfName = (row: ApprovalRecipeRow | null) => toStringValue(firstValue(row, ['pdf_file_name', 'findings_file_name'])) || 'AUS findings';

function DetailRow({ label, value }: DisplayRow) {
  const { colors } = useThemeColors();

  if (!hasText(value)) return null;

  return (
    <View style={[localStyles.detailRow, { borderBottomColor: colors.border }]}>
      <Text style={[localStyles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[localStyles.detailValue, { color: colors.textPrimary }]} selectable={true}>
        {value}
      </Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = 'default',
}: FieldProps) {
  const { colors, isDark } = useThemeColors();

  return (
    <View style={localStyles.field}>
      <Text style={[localStyles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          localStyles.input,
          {
            backgroundColor: isDark ? '#020617' : '#FFFFFF',
            borderColor: colors.border,
            color: colors.textPrimary,
          },
          multiline && localStyles.textArea,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

export function ApprovalRecipeSection({ leadId, leadSource }: ApprovalRecipeSectionProps) {
  const { colors, isDark } = useThemeColors();
  const [recipe, setRecipe] = useState<ApprovalRecipeRow | null>(null);
  const [form, setForm] = useState<ApprovalRecipeFormState>({ ...emptyApprovalRecipeForm });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAusDetails, setShowAusDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadRecipe = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const { data, error: loadError } = await fetchActiveApprovalRecipe({ leadId, leadSource });

    if (loadError) {
      setRecipe(null);
      setForm({ ...emptyApprovalRecipeForm });
      setError(loadError.message || 'Unable to load recipe');
    } else {
      setRecipe(data);
      setForm(rowToForm(data));
    }

    setEditing(false);
    setExpanded(false);
    setShowAusDetails(false);
    setLoading(false);
  }, [leadId, leadSource]);

  useEffect(() => {
    void loadRecipe();
  }, [loadRecipe]);

  const updateField = (key: keyof ApprovalRecipeFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const summaryItems = useMemo(() => {
    if (!recipe) return [];
    return [
      { label: 'Recommendation', value: getRecommendation(recipe) },
      { label: 'AUS', value: getAusSystem(recipe) },
      { label: 'LTV', value: formatPercent(firstValue(recipe, ['ltv'])) },
      { label: 'DTI', value: formatPercent(firstValue(recipe, ['dti'])) },
      { label: 'Reserves', value: toStringValue(firstValue(recipe, ['reserves'])) },
    ].filter((item) => hasText(item.value));
  }, [recipe]);

  const detailRows = useMemo<DisplayRow[]>(() => {
    if (!recipe) return [];
    return [
      { label: 'Recommendation', value: getRecommendation(recipe) },
      { label: 'AUS', value: getAusSystem(recipe) },
      { label: 'Findings Date', value: formatDate(firstValue(recipe, ['findings_date'])) },
      { label: 'Product', value: getProduct(recipe) },
      { label: 'Purpose', value: toStringValue(firstValue(recipe, ['loan_purpose'])) },
      { label: 'Occupancy', value: toStringValue(firstValue(recipe, ['occupancy'])) },
      { label: 'Property Type', value: toStringValue(firstValue(recipe, ['property_type'])) },
      { label: 'Price / Value', value: formatMoney(firstValue(recipe, ['price_value', 'purchase_price'])) },
      { label: 'Loan Amount', value: formatMoney(firstValue(recipe, ['loan_amount'])) },
      { label: 'LTV', value: formatPercent(firstValue(recipe, ['ltv'])) },
      { label: 'CLTV', value: formatPercent(firstValue(recipe, ['cltv'])) },
      { label: 'HCLTV', value: formatPercent(firstValue(recipe, ['htl_tv', 'hcltv'])) },
      { label: 'DTI', value: formatPercent(firstValue(recipe, ['dti'])) },
      { label: 'Housing Ratio', value: formatPercent(firstValue(recipe, ['housing_ratio'])) },
      { label: 'Credit Score', value: toStringValue(firstValue(recipe, ['credit_score'])) },
      { label: 'Reserves', value: toStringValue(firstValue(recipe, ['reserves'])) },
      { label: 'Confidence', value: formatConfidence(recipe) },
      { label: 'Updated', value: formatDateTime(firstValue(recipe, ['updated_at'])) },
    ];
  }, [recipe]);

  const startEdit = () => {
    setForm(rowToForm(recipe));
    setEditing(true);
    setExpanded(true);
    setError(null);
    setMessage(null);
  };

  const cancelEdit = () => {
    setForm(rowToForm(recipe));
    setEditing(false);
    setMessage(null);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    const { data, error: saveError } = await saveApprovalRecipe({
      recipeId: recipe?.id || null,
      leadId,
      leadSource,
      form,
    });

    if (saveError) {
      setError(saveError.message || 'Unable to save recipe');
    } else {
      setRecipe(data);
      setForm(rowToForm(data));
      setEditing(false);
      setExpanded(true);
      setShowAusDetails(false);
      setMessage('Approval recipe saved.');
    }

    setSaving(false);
  };

  const handleOpenFindings = async () => {
    const storagePath = getPdfPath(recipe);
    if (!storagePath) return;

    setOpeningFile(true);
    setError(null);

    const { url, error: openError } = await getApprovalRecipeFindingsUrl(storagePath);

    if (openError || !url) {
      setError(openError?.message || 'Unable to open AUS findings');
      setOpeningFile(false);
      return;
    }

    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert('Unable to open findings', 'The AUS findings could not be opened from this device.');
    } finally {
      setOpeningFile(false);
    }
  };

  const cardBackground = isDark ? '#0F172A' : colors.cardBackground;
  const subtleBackground = isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC';
  const isExpanded = expanded || editing;
  const ausSystem = getAusSystem(recipe);
  const strategyNotes = getStrategyNotes(recipe);
  const debtStrategy = getDebtStrategy(recipe);
  const conditionsSummary = getConditionsSummary(recipe);
  const pdfPath = getPdfPath(recipe);
  const hasAusDetails = hasText(debtStrategy) || hasText(conditionsSummary);
  const heading = loading
    ? 'Loading approval recipe...'
    : recipe
      ? getRecommendation(recipe) || ausSystem || 'Saved approval recipe'
      : 'No saved approval recipe';

  return (
    <View style={[localStyles.container, { backgroundColor: cardBackground, borderColor: colors.border }]}>
      <TouchableOpacity
        style={[localStyles.header, { backgroundColor: subtleBackground }]}
        onPress={() => setExpanded((current) => !current)}
        activeOpacity={0.75}
      >
        <View style={localStyles.headerText}>
          <Text style={[localStyles.kicker, { color: colors.textSecondary }]}>APPROVAL RECIPE</Text>
          <Text style={[localStyles.heading, { color: colors.textPrimary }]} numberOfLines={1}>
            {heading}
          </Text>
          <Text style={[localStyles.subheading, { color: colors.textSecondary }]} numberOfLines={1}>
            {recipe?.updated_at
              ? `Updated ${formatDateTime(recipe.updated_at)}`
              : 'Save the manual AUS strategy that worked'}
          </Text>
        </View>

        <View style={localStyles.headerRight}>
          {hasText(ausSystem) ? (
            <View style={localStyles.ausBadge}>
              <Text style={localStyles.ausBadgeText}>{ausSystem}</Text>
            </View>
          ) : null}
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {!isExpanded && summaryItems.length > 0 ? (
        <View style={localStyles.summaryChips}>
          {summaryItems.slice(0, 5).map((item) => (
            <View key={item.label} style={[localStyles.summaryChip, { borderColor: colors.border }]}>
              <Text style={localStyles.summaryChipText} numberOfLines={1}>
                {item.label}: {item.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {error ? (
        <View style={localStyles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
          <Text style={localStyles.errorText}>{error}</Text>
        </View>
      ) : null}

      {message ? (
        <View style={localStyles.successBanner}>
          <Ionicons name="checkmark-circle-outline" size={14} color="#16A34A" />
          <Text style={localStyles.successText}>{message}</Text>
        </View>
      ) : null}

      {isExpanded ? (
        <View style={localStyles.body}>
          {loading ? (
            <ActivityIndicator size="small" color={PLUM} />
          ) : editing ? (
            <>
              <View style={localStyles.formGrid}>
                <Field
                  label="AUS"
                  value={form.ausSystem}
                  onChangeText={(value) => updateField('ausSystem', value)}
                  placeholder="DU, LPA, Other"
                />
                <Field
                  label="Findings Date"
                  value={form.findingsDate}
                  onChangeText={(value) => updateField('findingsDate', value)}
                  placeholder="YYYY-MM-DD"
                />
                <Field
                  label="Recommendation"
                  value={form.recommendation}
                  onChangeText={(value) => updateField('recommendation', value)}
                  placeholder="Approve/Eligible"
                />
                <Field
                  label="Product"
                  value={form.productType}
                  onChangeText={(value) => updateField('productType', value)}
                  placeholder="Conventional 30 fixed"
                />
                <Field
                  label="Purpose"
                  value={form.loanPurpose}
                  onChangeText={(value) => updateField('loanPurpose', value)}
                  placeholder="Purchase"
                />
                <Field
                  label="Occupancy"
                  value={form.occupancy}
                  onChangeText={(value) => updateField('occupancy', value)}
                  placeholder="Primary"
                />
                <Field
                  label="Property Type"
                  value={form.propertyType}
                  onChangeText={(value) => updateField('propertyType', value)}
                  placeholder="Single family"
                />
                <Field
                  label="Price / Value"
                  value={form.purchasePrice}
                  onChangeText={(value) => updateField('purchasePrice', value)}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Loan Amount"
                  value={form.loanAmount}
                  onChangeText={(value) => updateField('loanAmount', value)}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="LTV"
                  value={form.ltv}
                  onChangeText={(value) => updateField('ltv', value)}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="CLTV"
                  value={form.cltv}
                  onChangeText={(value) => updateField('cltv', value)}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="HCLTV"
                  value={form.hcltv}
                  onChangeText={(value) => updateField('hcltv', value)}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="DTI"
                  value={form.dti}
                  onChangeText={(value) => updateField('dti', value)}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Housing Ratio"
                  value={form.housingRatio}
                  onChangeText={(value) => updateField('housingRatio', value)}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Credit Score"
                  value={form.creditScore}
                  onChangeText={(value) => updateField('creditScore', value)}
                  keyboardType="number-pad"
                />
                <Field
                  label="Reserves"
                  value={form.reserves}
                  onChangeText={(value) => updateField('reserves', value)}
                  placeholder="2 months required"
                />
              </View>

              <Field
                label="Must Not Change / Strategy Note"
                value={form.strategyNotes}
                onChangeText={(value) => updateField('strategyNotes', value)}
                placeholder="Keep DTI under 45%. Freddie only. Pay off Discover before closing."
                multiline
              />
              <Field
                label="Debt Strategy"
                value={form.debtStrategy}
                onChangeText={(value) => updateField('debtStrategy', value)}
                multiline
              />
              <Field
                label="AUS Conditions"
                value={form.keyConditions}
                onChangeText={(value) => updateField('keyConditions', value)}
                multiline
              />

              <View style={localStyles.actionRow}>
                <TouchableOpacity
                  style={[localStyles.secondaryButton, { borderColor: colors.border }]}
                  onPress={cancelEdit}
                  disabled={saving}
                >
                  <Text style={[localStyles.secondaryButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[localStyles.primaryButton, saving && localStyles.disabledButton]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={15} color="#FFFFFF" />
                      <Text style={localStyles.primaryButtonText}>Save</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : recipe ? (
            <>
              <View style={localStyles.detailList}>
                {detailRows.map((row) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} />
                ))}
              </View>

              {hasText(strategyNotes) ? (
                <View style={localStyles.strategyBox}>
                  <Text style={localStyles.strategyLabel}>MUST NOT CHANGE</Text>
                  <Text style={localStyles.strategyText} selectable={true}>
                    {strategyNotes}
                  </Text>
                </View>
              ) : null}

              {hasAusDetails ? (
                <View style={[localStyles.disclosure, { borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={localStyles.disclosureHeader}
                    onPress={() => setShowAusDetails((current) => !current)}
                    activeOpacity={0.75}
                  >
                    <Text style={[localStyles.disclosureTitle, { color: colors.textPrimary }]}>View AUS details</Text>
                    <Ionicons
                      name={showAusDetails ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                  {showAusDetails ? (
                    <View style={localStyles.disclosureBody}>
                      {hasText(debtStrategy) ? (
                        <Text style={[localStyles.longText, { color: colors.textSecondary }]} selectable={true}>
                          <Text style={localStyles.longTextLabel}>Debt strategy: </Text>
                          {debtStrategy}
                        </Text>
                      ) : null}
                      {hasText(conditionsSummary) ? (
                        <Text style={[localStyles.longText, { color: colors.textSecondary }]} selectable={true}>
                          <Text style={localStyles.longTextLabel}>Conditions: </Text>
                          {conditionsSummary}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {hasText(pdfPath) ? (
                <TouchableOpacity
                  style={[localStyles.findingsButton, { borderColor: colors.border }]}
                  onPress={handleOpenFindings}
                  disabled={openingFile}
                  activeOpacity={0.75}
                >
                  <View style={localStyles.findingsTextWrap}>
                    <Ionicons name="document-text-outline" size={16} color={PLUM} />
                    <Text style={localStyles.findingsText} numberOfLines={1}>
                      Open AUS Findings
                    </Text>
                  </View>
                  {openingFile ? (
                    <ActivityIndicator size="small" color={PLUM} />
                  ) : (
                    <Text style={[localStyles.findingsMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {getPdfName(recipe)}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}

              <View style={localStyles.actionRow}>
                <TouchableOpacity style={localStyles.primaryButton} onPress={startEdit}>
                  <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                  <Text style={localStyles.primaryButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[localStyles.secondaryButton, { borderColor: colors.border }]}
                  onPress={loadRecipe}
                >
                  <Ionicons name="refresh-outline" size={15} color={colors.textSecondary} />
                  <Text style={[localStyles.secondaryButtonText, { color: colors.textSecondary }]}>Refresh</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={[localStyles.emptyText, { color: colors.textSecondary }]}>
                No saved approval recipe.
              </Text>
              <TouchableOpacity style={localStyles.primaryButton} onPress={startEdit}>
                <Ionicons name="add-circle-outline" size={15} color="#FFFFFF" />
                <Text style={localStyles.primaryButtonText}>Add Manual Recipe</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heading: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  subheading: {
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ausBadge: {
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  ausBadgeText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '800',
  },
  summaryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  summaryChip: {
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  summaryChipText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  body: {
    padding: 14,
    gap: 12,
  },
  detailList: {
    gap: 0,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  detailLabel: {
    flex: 1,
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  detailValue: {
    flex: 1.2,
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  strategyBox: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  strategyLabel: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  strategyText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  disclosure: {
    borderWidth: 1,
    borderRadius: 10,
  },
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disclosureTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  disclosureBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  longText: {
    fontSize: 12,
    lineHeight: 18,
  },
  longTextLabel: {
    fontWeight: '800',
    color: '#475569',
  },
  findingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F5F3FF',
  },
  findingsTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  findingsText: {
    color: PLUM,
    fontSize: 13,
    fontWeight: '800',
  },
  findingsMeta: {
    flex: 1,
    fontSize: 12,
    textAlign: 'right',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 10,
  },
  field: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 130,
  },
  fieldLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 5,
  },
  input: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  textArea: {
    minHeight: 86,
    lineHeight: 19,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 9,
    backgroundColor: PLUM,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.7,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorText: {
    flex: 1,
    color: '#DC2626',
    fontSize: 12,
    lineHeight: 17,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  successText: {
    flex: 1,
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '700',
  },
});
