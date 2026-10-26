import type { OrganizationSettings } from "@rakazo/contracts";
import { formatRnc } from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { AlmaRow, AlmaScreen, almaColors } from "../components/alma-screen";
import { chooseFirmSpace, loadFirm, loadFirmSpaces } from "../lib/alma-client";
import { almaText } from "../lib/alma-copy";
import type { MockSpace } from "../lib/alma-mock";
import { useI18n } from "../lib/i18n";

export default function FirmScreen() {
  const { locale } = useI18n();
  const [firm, setFirm] = useState<OrganizationSettings | null>(null);
  const [spaces, setSpaces] = useState<MockSpace[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadFirm(), loadFirmSpaces()])
      .then(([settings, navigation]) => {
        if (!active) return;
        setFirm(settings);
        setSpaces(navigation.spaces);
        setCurrentId(navigation.currentId);
      })
      .catch(() => {
        if (active) setError(almaText("couldNotLoad", locale));
      });
    return () => {
      active = false;
    };
  }, [locale]);

  const lines = firm
    ? [
        firm.tradeName || firm.legalName,
        firm.legalName,
        firm.rnc ? `RNC ${formatRnc(firm.rnc)}` : "",
        firm.addressLine,
        firm.cityProvince,
        firm.phone,
        firm.email,
      ].filter((line) => line.trim().length > 0)
    : [];

  return (
    <AlmaScreen title={almaText("firm", locale)}>
      <Text style={{ color: almaColors.mutedForeground }}>{almaText("readOnlyFirm", locale)}</Text>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: almaColors.destructive }}>
          {error}
        </Text>
      ) : null}
      <Text style={{ color: almaColors.foreground, fontSize: 13 }}>
        {almaText("selectFirm", locale)}
      </Text>
      {spaces.map((space) => (
        <AlmaRow
          key={space.id}
          title={space.name}
          detail={space.id === currentId ? almaText("firm", locale) : undefined}
          onPress={() => {
            setCurrentId(space.id);
            void chooseFirmSpace(space.id);
          }}
        />
      ))}
      <Text style={{ color: almaColors.foreground, fontSize: 13 }}>
        {almaText("firmDetails", locale)}
      </Text>
      {lines.map((line) => (
        <AlmaRow key={line} title={line} />
      ))}
      <Text style={{ color: almaColors.foreground, fontSize: 13 }}>
        {almaText("lawyers", locale)}
      </Text>
      {firm?.lawyers.map((lawyer) => (
        <AlmaRow
          key={lawyer.id}
          title={lawyer.name}
          detail={`${lawyer.cardNumber} · ${lawyer.mayApproveDrafts ? almaText("mayApprove", locale) : almaText("cannotApprove", locale)}`}
        />
      ))}
    </AlmaScreen>
  );
}
