export default {
	extends: ['stylelint-config-clean-order', 'stylelint-config-standard'],
	rules: {
		// https://github.com/suitcss/suit/blob/master/doc/naming-conventions.md
		"selector-class-pattern": "u-(sm-|md-|lg-)[A-Za-z]+|([a-z]+-)?[A-Za-z]+(-[A-Za-z]+)?(--[A-Za-z]+)?|is-[A-Za-z]+"
	}
};
