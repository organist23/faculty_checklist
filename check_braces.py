
import sys

def check_balance(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    braces = 0
    parens = 0
    cur_line = 1
    cur_col = 1
    
    for char in content:
        if char == '{': braces += 1
        elif char == '}': braces -= 1
        elif char == '(': parens += 1
        elif char == ')': parens -= 1
        
        if char == '\n':
            cur_line += 1
            cur_col = 1
        else:
            cur_col += 1
            
        if braces < 0:
            print(f"Extra closing brace at line {cur_line}, col {cur_col}")
            # braces = 0 # reset to continue
        if parens < 0:
            print(f"Extra closing parenthesis at line {cur_line}, col {cur_col}")
            # parens = 0 # reset to continue
            
    print(f"Final balance: braces={braces}, parens={parens}")

if __name__ == "__main__":
    check_balance(sys.argv[1])
