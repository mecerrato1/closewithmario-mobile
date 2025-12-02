// src/components/dashboard/QuoteOfTheDay.tsx
import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getQuoteOfTheDay } from "../../utils/getQuoteOfTheDay";

type Props = {
  userKey?: string; // e.g. user email or id
};

const QuoteOfTheDay: React.FC<Props> = ({ userKey }) => {
  const quote = useMemo(() => getQuoteOfTheDay(userKey), [userKey]);

  return (
    <View
      style={{
        marginTop: 4,
        marginBottom: 12,
        padding: 16,
        borderRadius: 16,
        backgroundColor: "rgba(91, 33, 182, 0.4)",
        borderWidth: 1.5,
        borderColor: "rgba(167, 139, 250, 0.5)",
      }}
    >
      {/* Header row with icon */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <Ionicons name="bulb-outline" size={18} color="#FBBF24" />
        <Text
          style={{
            fontSize: 12,
            fontWeight: "700",
            color: "#FBBF24",
            marginLeft: 8,
            textTransform: "uppercase",
            letterSpacing: 1.5,
          }}
        >
          Daily Motivation
        </Text>
      </View>
      
      {/* Quote text */}
      <Text
        style={{
          fontSize: 15,
          fontStyle: "italic",
          color: "#FFFFFF",
          lineHeight: 22,
          marginBottom: 12,
        }}
      >
        "{quote.text}"
      </Text>
      
      {/* Author */}
      <Text
        style={{
          fontSize: 13,
          fontWeight: "500",
          color: "rgba(255, 255, 255, 0.8)",
          textAlign: "right",
        }}
      >
        — {quote.author}
      </Text>
    </View>
  );
};

export default QuoteOfTheDay;
