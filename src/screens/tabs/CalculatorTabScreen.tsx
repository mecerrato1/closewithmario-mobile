// src/screens/tabs/CalculatorTabScreen.tsx
import React from 'react';
import MortgageCalculatorScreen from '../MortgageCalculatorScreen';

interface CalculatorTabScreenProps {
  onNavigateToLeads: () => void;
}

export default function CalculatorTabScreen({ onNavigateToLeads }: CalculatorTabScreenProps) {
  // Reuse the existing MortgageCalculatorScreen
  // The onClose prop navigates back to the My Leads tab
  return <MortgageCalculatorScreen onClose={onNavigateToLeads} />;
}
